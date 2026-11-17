from __future__ import annotations
import argparse, hashlib, json, struct, urllib.request
from pathlib import Path
import math
import numpy as np

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import importlib.util
_spec = importlib.util.spec_from_file_location("prepare_candidate", Path(__file__).with_name("prepare-combinatorial-corpus.py"))
assert _spec and _spec.loader
_prepare = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_prepare)


def read_matrix(path: Path) -> np.ndarray:
    raw=path.read_bytes()
    count, dim=struct.unpack_from('<II',raw,0)
    if len(raw) != 8 + count*dim*4:
        raise ValueError(f'{path}: binary size does not match header')
    return np.frombuffer(raw,dtype='<f4',offset=8).reshape(count,dim)

def embed_queries(endpoint: str, model: str, texts: list[str]) -> np.ndarray:
    request=urllib.request.Request(endpoint.rstrip('/')+'/api/embed',data=json.dumps({'model':model,'input':texts}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=180) as response: payload=json.load(response)
    vectors=np.asarray(payload.get('embeddings'),dtype=np.float32)
    if vectors.ndim != 2 or vectors.shape[0] != len(texts) or not np.isfinite(vectors).all():
        raise ValueError('Ollama returned malformed query embeddings')
    norms=np.linalg.norm(vectors,axis=1,keepdims=True)
    if np.any(norms == 0): raise ValueError('Ollama returned a zero-norm query embedding')
    return vectors/norms

def query_hits(parameters: list[dict], matrix: np.ndarray, queries: list[dict], query_vectors: np.ndarray, top_k: int) -> list[dict]:
    names=[str(row.get('technical_name','')) for row in parameters]
    if matrix.shape[0] != len(names): raise ValueError('Parameter/vector row alignment mismatch')
    result=[]
    for query, vector in zip(queries,query_vectors):
        scores=matrix @ vector
        indexes=np.argsort(-scores,kind='stable')[:top_k]
        hits=[{'technical_name':names[int(index)],'similarity':float(scores[index])} for index in indexes]
        tokens=[token.lower() for token in query['required_tokens']]
        relevant=sum(all(token in item['technical_name'].lower() for token in tokens) for item in hits)
        result.append({'id':query['id'],'query':query['text'],'relevant_top_k':relevant,'top':hits})
    return result

def evaluate_query_gate(old_hits: list[dict], new_hits: list[dict], minimum_relevant_queries: int) -> dict:
    if len(old_hits) != len(new_hits):
        raise ValueError('Baseline/candidate query result counts differ')
    non_regressions = [new['relevant_top_k'] >= old['relevant_top_k'] for old, new in zip(old_hits, new_hits)]
    useful = [new['relevant_top_k'] >= 1 for new in new_hits]
    return {
        'passed_queries': sum(useful),
        'required_queries': minimum_relevant_queries,
        'non_regressed_queries': sum(non_regressions),
        'query_count': len(new_hits),
        'regressed_query_ids': [new['id'] for old, new in zip(old_hits, new_hits) if new['relevant_top_k'] < old['relevant_top_k']],
        'criterion_passed': sum(useful) >= minimum_relevant_queries and all(non_regressions),
    }

def invalid_select_controls(parameters: list[dict]) -> list[str]:
    """Return Select names whose option/default contract cannot be represented safely."""
    invalid = []
    for row in parameters:
        if row.get('ui_element') != 'Select':
            continue
        name = str(row.get('technical_name') or '<unnamed>')
        options = row.get('options')
        if not isinstance(options, list) or not options:
            invalid.append(name)
            continue
        if any(not isinstance(option, (str, int, float)) or isinstance(option, bool)
               or isinstance(option, float) and not math.isfinite(option) for option in options):
            invalid.append(name)
            continue
        option_keys = [(type(option).__name__, json.dumps(option, ensure_ascii=False, allow_nan=False)) for option in options]
        if len(set(option_keys)) != len(option_keys):
            invalid.append(name)
            continue
        default = row.get('default')
        if not any(type(default) is type(option) and default == option for option in options):
            invalid.append(name)
    return sorted(set(invalid))

def acceptance_status(criteria: dict[str, bool]) -> str:
    return 'passed' if criteria and all(criteria.values()) else 'not_passed'

def validate_qwen_bundle(bundle_root: Path, source_revision: str, snapshot_sha256: str, excluded_sha256: str,
                         source_count: int, dataset_version: str) -> tuple[bool, str | None, dict]:
    manifest_path = bundle_root / 'bundle-manifest.json'
    if not manifest_path.is_file(): return False, 'Qwen bundle manifest is missing', {}
    bundle = json.loads(manifest_path.read_text(encoding='utf8'))
    if (bundle.get('status') != 'complete' or bundle.get('encoder') != 'qwen3'
        or bundle.get('source_revision') != source_revision
        or bundle.get('source_snapshot_sha256') != snapshot_sha256
        or bundle.get('excluded_sha256') != excluded_sha256
        or int(bundle.get('source_parameter_count', -1)) != source_count
        or bundle.get('dataset_version') != dataset_version):
        return False, 'Qwen bundle metadata does not match the captured candidate source', bundle
    files = bundle.get('files')
    if not isinstance(files, list): return False, 'Qwen bundle file inventory is malformed', bundle
    present = set()
    root = bundle_root.resolve()
    for entry in files:
        if not isinstance(entry, dict) or not isinstance(entry.get('path'), str):
            return False, 'Qwen bundle file inventory has a malformed entry', bundle
        file_path = (root / entry['path']).resolve()
        if file_path == root or root not in file_path.parents:
            return False, 'Qwen bundle file path escapes its immutable directory', bundle
        if not file_path.is_file(): return False, f"Qwen bundle file is missing: {entry['path']}", bundle
        raw = file_path.read_bytes()
        if len(raw) != entry.get('bytes') or hashlib.sha256(raw).hexdigest() != entry.get('sha256'):
            return False, f"Qwen bundle checksum failed: {entry['path']}", bundle
        present.add(entry['path'])
    required = {
        'composite-index/manifest.json', 'composite-index/rows.json', 'composite-index/embeddings.f32',
        'anchors/anchors_build.json', 'value-anchors/manifest.json', 'value-anchors/select-options.json',
        'relations/manifest.json', 'relations/embeddings.f32', 'runtime-atoms/manifest.json',
        'runtime-atoms/atoms.json', 'runtime-atoms/atom_embeddings.f32',
    }
    missing = sorted(required - present)
    if missing: return False, f"Qwen bundle is missing required artifacts: {', '.join(missing)}", bundle
    return True, None, bundle

def load_composite(directory: Path) -> tuple[dict, list[dict], np.ndarray]:
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf8'))
    rows = json.loads((directory / manifest['files']['rows']).read_text(encoding='utf8'))
    matrix = read_matrix(directory / manifest['files']['embeddings'])
    if matrix.shape[0] != len(rows) or matrix.shape[1] != int(manifest['dimensions']):
        raise ValueError(f"{directory}: Qwen composite rows and vectors are not aligned")
    return manifest, rows, matrix

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--candidate-dir',type=Path,required=True)
    parser.add_argument('--runtime-index-dir',type=Path,help='Candidate-local runtime atom index directory; defaults to the versioned active index path.')
    parser.add_argument('--old-dir',type=Path,default=Path('data/combinatorial-genesis/flowmusic-output'))
    parser.add_argument('--endpoint',required=True)
    parser.add_argument('--model',required=True)
    parser.add_argument('--old-version',default='')
    args=parser.parse_args()
    candidate=args.candidate_dir
    plan=json.loads((candidate/'acceptance-plan.json').read_text(encoding='utf8'))
    source=json.loads((candidate/'effective-live-snapshot.json').read_text(encoding='utf8'))
    new_parameters=json.loads((candidate/'prepared/eligible_parameters.json').read_text(encoding='utf8'))
    candidate_record=json.loads((candidate/'candidate.json').read_text(encoding='utf8'))
    frozen_version=candidate_record['version_id']
    data_root=Path('data/combinatorial-genesis')
    frozen_parameters=json.loads((data_root/'datasets'/frozen_version/'parameters.json').read_text(encoding='utf8'))
    frozen_manifest=json.loads((data_root/'datasets'/frozen_version/'manifest.json').read_text(encoding='utf8'))
    old_parameters=json.loads((args.old_dir/'eligible_parameters.json').read_text(encoding='utf8'))
    old_meta=json.loads((args.old_dir/'semantic_embeddings_meta.json').read_text(encoding='utf8'))
    new_meta=json.loads((candidate/'prepared/semantic_embeddings_meta.json').read_text(encoding='utf8'))
    if old_meta.get('model') != args.model or new_meta.get('model') != args.model:
        raise ValueError('Baseline/candidate embeddings are not in the configured same model space')
    if old_meta.get('endpoint') != args.endpoint or new_meta.get('endpoint') != args.endpoint:
        raise ValueError('Baseline/candidate embedding endpoints differ')
    old_vectors=read_matrix(args.old_dir/'semantic_embeddings.f32')
    new_vectors=read_matrix(candidate/'prepared/semantic_embeddings.f32')
    if old_vectors.shape[1] != new_vectors.shape[1]: raise ValueError('Embedding dimensions differ')
    queries=plan['queries']
    q_vectors=embed_queries(args.endpoint,args.model,[item['text'] for item in queries])
    if q_vectors.shape[1] != old_vectors.shape[1]: raise ValueError('Query vector dimension differs')
    old_hits=query_hits(old_parameters,old_vectors,queries,q_vectors,int(plan['top_k']))
    new_hits=query_hits(new_parameters,new_vectors,queries,q_vectors,int(plan['top_k']))
    latest=json.loads(Path('data/combinatorial-genesis/datasets/latest.json').read_text(encoding='utf8'))
    old_version=args.old_version or str(latest['version_id'])
    old_names={str(row['technical_name']) for row in json.loads((Path('data/combinatorial-genesis/datasets')/old_version/'parameters.json').read_text(encoding='utf8'))}
    current_names={str(row['technical_name']) for row in source}
    preservation=len(old_names & current_names)/max(1,len(old_names))
    minimum_relevant_queries = int(plan['thresholds']['minimum_relevant_queries'])
    query_gate = evaluate_query_gate(old_hits, new_hits, minimum_relevant_queries)
    source_status=json.loads((candidate/'source-status.json').read_text(encoding='utf8'))
    qwen_bundle_path=candidate_record.get('qwen_bundle_path')
    qwen_bundle_root=(data_root/str(qwen_bundle_path)).resolve() if isinstance(qwen_bundle_path,str) else candidate/'missing-qwen-bundle'
    maintenance_root=(data_root/'maintenance').resolve()
    qwen_bundle_inside_maintenance=maintenance_root in qwen_bundle_root.parents
    qwen_bundle_valid=False
    qwen_bundle_reason='Candidate does not name a Qwen bundle'
    qwen_bundle={}
    qwen_composite_gate={'criterion_passed':False,'passed_queries':0,'required_queries':minimum_relevant_queries,
        'non_regressed_queries':0,'query_count':len(queries),'regressed_query_ids':[item['id'] for item in queries],
        'reason':'Qwen bundle could not be evaluated'}
    qwen_composite_comparison=[]
    if qwen_bundle_inside_maintenance:
        qwen_bundle_valid,qwen_bundle_reason,qwen_bundle=validate_qwen_bundle(
            qwen_bundle_root,source_status['source_revision'],source_status['source_snapshot_sha256'],
            source_status['excluded_registry_sha256'],len(source),frozen_version)
        if qwen_bundle_valid:
            try:
                candidate_qwen_manifest,candidate_qwen_rows,candidate_qwen_vectors=load_composite(qwen_bundle_root/'composite-index')
                latest=json.loads((data_root/'datasets'/'latest.json').read_text(encoding='utf8'))
                old_qwen_root=(data_root/str(latest['qwen_bundle_path'])).resolve() if latest.get('qwen_bundle_path') else data_root/'v3'/'composite-index'
                if latest.get('qwen_bundle_path') and maintenance_root not in old_qwen_root.parents:
                    raise ValueError('Active Qwen bundle pointer escapes the immutable candidate area')
                old_qwen_manifest,old_qwen_rows,old_qwen_vectors=load_composite(old_qwen_root)
                same_qwen_space=(candidate_qwen_manifest.get('model')==args.model==old_qwen_manifest.get('model')
                    and candidate_qwen_vectors.shape[1]==old_qwen_vectors.shape[1]
                    and candidate_qwen_vectors.shape[1]==q_vectors.shape[1])
                if not same_qwen_space:
                    qwen_bundle_reason='Active and candidate Qwen composite indexes are not in the same configured model/dimension space'
                    qwen_composite_gate['reason']=qwen_bundle_reason
                else:
                    old_qwen_hits=query_hits(old_qwen_rows,old_qwen_vectors,queries,q_vectors,int(plan['top_k']))
                    new_qwen_hits=query_hits(candidate_qwen_rows,candidate_qwen_vectors,queries,q_vectors,int(plan['top_k']))
                    qwen_composite_gate=evaluate_query_gate(old_qwen_hits,new_qwen_hits,minimum_relevant_queries)
                    qwen_composite_comparison=[{'id':old['id'],'baseline_hits':old['relevant_top_k'],'candidate_hits':new['relevant_top_k'],
                        'baseline_top':[x['technical_name'] for x in old['top']],
                        'candidate_top':[x['technical_name'] for x in new['top']]} for old,new in zip(old_qwen_hits,new_qwen_hits)]
            except Exception as error:
                qwen_bundle_reason=str(error)
                qwen_composite_gate['reason']=qwen_bundle_reason
    else:
        qwen_bundle_reason='Qwen bundle path is missing or outside the immutable maintenance tree'
    source_by_name={str(row['technical_name']):row for row in source}
    frozen_by_name={str(row['technical_name']):row for row in frozen_parameters}
    required_fields=('technical_name','name_ru','description_en','description_ru','category','sub_category','ui_element','min_value','max_value','step','default','options','unit','quantity_kind','lyria_prompt_tags','semantic_keywords','domain','domain_layer')
    def clean_source(row: dict) -> dict:
        clean={key:row[key] for key in required_fields if key in row}
        if clean.get('ui_element') not in {'Range','Toggle'}:
            for key in ('min_value','max_value','step'): clean.pop(key,None)
        if clean.get('ui_element') != 'Select': clean.pop('options',None)
        return clean
    field_mismatches=[name for name,row in source_by_name.items() if frozen_by_name.get(name)!=clean_source(row)]
    runtime_dir=args.runtime_index_dir or data_root/'indexes'/frozen_version
    runtime_manifest=json.loads((runtime_dir/'manifest.json').read_text(encoding='utf8'))
    runtime_rows_path=runtime_dir/'atoms.json'; runtime_vectors_path=runtime_dir/'atom_embeddings.f32'
    runtime_rows_bytes=runtime_rows_path.read_bytes(); runtime_vectors_bytes=runtime_vectors_path.read_bytes()
    runtime_rows=json.loads(runtime_rows_bytes.decode('utf8'))
    runtime_vectors=read_matrix(runtime_vectors_path)
    runtime_source_revision_matches=runtime_manifest.get('effective_catalogue_revision')==source_status.get('source_revision')
    frozen_atoms=json.loads((data_root/'datasets'/frozen_version/'atoms.json').read_text(encoding='utf8'))
    runtime_atom_identity_text_order_match=[(row.get('atom'),row.get('embedding_text')) for row in runtime_rows]==[(row.get('atom'),str(row.get('atom','')).replace('_',' ').strip()) for row in frozen_atoms]
    runtime_integrity=(hashlib.sha256(runtime_rows_bytes).hexdigest()==runtime_manifest.get('rows_sha256')
        and hashlib.sha256(runtime_vectors_bytes).hexdigest()==runtime_manifest.get('vectors_sha256')
        and len(runtime_rows)==int(runtime_manifest.get('atom_count',-1))==runtime_vectors.shape[0]
        and runtime_vectors.shape[1]==int(runtime_manifest.get('dimensions',-1)))
    tombstone_file=data_root/'library/catalogue-deleted.json'
    tomb_payload=json.loads(tombstone_file.read_text(encoding='utf8')) if tombstone_file.exists() else []
    tombstones=set(tomb_payload if isinstance(tomb_payload,list) else tomb_payload.get('technical_names',[]))
    registry=json.loads((data_root/'registry/excluded.json').read_text(encoding='utf8')) if (data_root/'registry/excluded.json').exists() else {'entries':[]}
    excluded={str(row.get('technical_name')) for row in registry.get('entries',[]) if row.get('technical_name')}
    diagnostics=[diagnostic for row in runtime_rows for diagnostic in row.get('source_reference_diagnostics',[])]
    invalid_sources=[name for row in runtime_rows for name in row.get('source_parameters',[]) if name not in current_names or name in tombstones or name in excluded]
    semantic_groups=json.loads((data_root/'datasets'/frozen_version/'semantic_groups.json').read_text(encoding='utf8'))
    group_shape_conflicts=[]
    for group in semantic_groups:
        members=[source_by_name[name] for name in group.get('members',[]) if name in source_by_name]
        for left_index,left in enumerate(members):
            for right in members[left_index+1:]:
                compatible,_reason=_prepare.parameter_shape_compatible(left,right)
                if not compatible: group_shape_conflicts.append([left.get('technical_name'),right.get('technical_name')])
    missing_layers=sum(row.get('domain_layer') is None for row in source)
    invalid_ranges=[]
    for row in source:
        if row.get('ui_element')=='Range':
            values=[row.get(key) for key in ('min_value','default','max_value','step')]
            if not all(isinstance(value,(int,float)) and math.isfinite(value) for value in values) or not values[0] <= values[1] <= values[2] or values[3] <= 0:
                invalid_ranges.append(row.get('technical_name'))
    invalid_select_defaults = invalid_select_controls(source)
    report={
      'schema_version':1,'created_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
      'candidate_id':candidate.name,'model':args.model,'endpoint':args.endpoint,'top_k':int(plan['top_k']),
      'old_source_count':len(old_names),'candidate_effective_source_count':len(source),'old_source_retention':preservation,
      'old_names_missing_from_candidate':sorted(old_names-current_names),'new_effective_names':len(current_names-old_names),
      'old_embedding_count':len(old_parameters),'candidate_eligible_count':len(new_parameters),
      'frozen_parameter_count':len(frozen_parameters),'frozen_ids_match_source':set(frozen_by_name)==set(source_by_name),
      'source_field_mismatch_count':len(field_mismatches),'source_field_mismatch_examples':field_mismatches[:20],
      'source_ids_without_domain_layer':missing_layers,'runtime_integrity':runtime_integrity,
      'runtime_atom_identity_text_order_match':runtime_atom_identity_text_order_match,
      'runtime_atom_count':len(runtime_rows),'runtime_source_reference_count':sum(len(row.get('source_parameters',[])) for row in runtime_rows),
      'runtime_effective_catalogue_revision':runtime_manifest.get('effective_catalogue_revision'),
      'runtime_source_revision_matches':runtime_source_revision_matches,
      'runtime_unique_source_count':len({name for row in runtime_rows for name in row.get('source_parameters',[])}),
      'runtime_invalid_source_count':len(invalid_sources),'runtime_diagnostic_reasons':dict(__import__('collections').Counter(str(item.get('reason')) for item in diagnostics)),
      'runtime_max_sources_per_atom':max((len(row.get('source_parameters',[])) for row in runtime_rows),default=0),
      'semantic_group_count':len(semantic_groups),'semantic_group_shape_conflict_count':len(group_shape_conflicts),
      'invalid_range_value_count':len(invalid_ranges),'invalid_range_examples':invalid_ranges[:20],
      'invalid_select_default_count':len(invalid_select_defaults),'invalid_select_default_examples':invalid_select_defaults[:20],
      'old_dimensions':int(old_vectors.shape[1]),'candidate_dimensions':int(new_vectors.shape[1]),
      'query_comparison':{**query_gate,'minimum_candidate_hits':minimum_relevant_queries,'candidate_hits_must_not_be_lower_than_baseline':True,'per_query':[{'id':old['id'],'baseline_hits':old['relevant_top_k'],'candidate_hits':new['relevant_top_k'],'baseline_top':[x['technical_name'] for x in old['top']],'candidate_top':[x['technical_name'] for x in new['top']]} for old,new in zip(old_hits,new_hits)]},
      'qwen_bundle_integrity':{'valid':qwen_bundle_valid,'reason':qwen_bundle_reason,'source_revision':qwen_bundle.get('source_revision'),'artifacts':qwen_bundle.get('artifacts',[])},
      'qwen_composite_query_comparison':{**qwen_composite_gate,'minimum_candidate_hits':minimum_relevant_queries,
        'candidate_hits_must_not_be_lower_than_baseline':True,'per_query':qwen_composite_comparison},
      'criteria':{'old_source_retention':preservation >= float(plan['thresholds']['minimum_old_name_retention']),'fixed_query_retrieval':query_gate['criterion_passed'],'same_model_space':old_vectors.shape[1]==new_vectors.shape[1] and old_meta.get('model')==new_meta.get('model') and old_meta.get('endpoint')==new_meta.get('endpoint'),'full_source_snapshot':len(frozen_parameters)==len(source) and set(frozen_by_name)==set(source_by_name) and not field_mismatches and frozen_manifest.get('source_revision')==source_status['source_revision'],'runtime_rows_vectors_integrity':runtime_integrity and runtime_atom_identity_text_order_match and runtime_source_revision_matches,'donor_references_allowed':not invalid_sources and not any(item.get('reason') in {'unresolved','tombstoned','excluded'} for item in diagnostics) and max((len(row.get('source_parameters',[])) for row in runtime_rows),default=0)<=24,'semantic_groups_shape_compatible':not group_shape_conflicts,'range_values_valid':not invalid_ranges,'select_values_valid':not invalid_select_defaults,'qwen_candidate_bundle_integrity':qwen_bundle_valid,'qwen_composite_query_retrieval':qwen_composite_gate['criterion_passed']},
    }
    report['acceptance_status']=acceptance_status(report['criteria'])
    out=candidate/'comparison-report.json'; out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    print(json.dumps({'report':str(out),'acceptance_status':report['acceptance_status'],'retention':preservation,'query_passes':query_gate['passed_queries'],'non_regressed_queries':query_gate['non_regressed_queries'],'regressed_queries':query_gate['regressed_query_ids'],'missing_old':len(old_names-current_names)}))
    return 0

if __name__=='__main__': raise SystemExit(main())
