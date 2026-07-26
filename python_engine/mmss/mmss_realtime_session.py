#!/usr/bin/env python3
"""
MMSS v2.2 — реальное время: ℋ (checkpoint) -> ⊘ (мосты) -> ↯ (переходы) -> кристаллы paradox.

Поток на ввод узла в Mosaic-Topologies UI (URL1/2):
  ingest(node_text)
    -> encode z_q  (pluggable encoder: feature-hash сейчас, Ollama-эмбеддинги позже)
    -> compute invariant = f(z_q; ℋ(z_q))   (ℋ загружена из checkpoint .pt)
    -> обновить live-индекс инвариантов
    -> adaptive threshold (Otsu на распределении косинусов, с защитами)
    -> stable clusters (emergent voices) = плотные кластеры при max(adaptive, 0.90)
    -> ⊘ bridges = узлы, чьи соседи покрывают >=2 stable-кластера
    -> ↯ phase transition = мост объединил ранее отдельные stable-кластеры
    -> материализация мостов как кристаллов 'paradox' в локальный JSONL-стор (URL4-совместимая симуляция)
    -> emits UI-события для панелей: Autonomous isomorphisms ⊘ / Phase transitions ↯ / Emergent voices

Ollama-swap-ready: encoder и teacher вынесены как pluggable callable.
"""

import hashlib
import json
import time
import uuid
from collections import defaultdict
from pathlib import Path

import torch

from mmss_v22_core import MMSSCore, SEED
from mmss_distill_isomorphism import query_domains, DOMAINS  # только для оценки ground truth в демо

torch.manual_seed(SEED)


# ---------------------------------------------------------------------------
# Pluggable encoder (Ollama-swap-ready). Сейчас feature-hash; позже — Ollama.
# ---------------------------------------------------------------------------
def feature_hash_encoder(text: str, dim: int) -> torch.Tensor:
    from mmss_v22_core import _hash_to_vector
    return _hash_to_vector(text, dim)


class OllamaEncoderPlaceholder:
    """Заглушка-контракт: Ollama-энкодер подключается локально позже.
    Интерфейс: __call__(text) -> torch.Tensor[dim]. Рекомендуется bge-small / nomic-embed."""
    def __init__(self, dim: int):
        self.dim = dim
        self.note = "placeholder; replace with Ollama embeddings client locally"

    def __call__(self, text: str, dim: int) -> torch.Tensor:
        # пока делегируем feature-hash, чтобы цикл оставался рабочим офлайн
        return feature_hash_encoder(text, dim)


# ---------------------------------------------------------------------------
# Adaptive threshold: Otsu на распределении косинусов с защитами
# ---------------------------------------------------------------------------
def adaptive_threshold(invs: list, default: float = 0.85, floor: float = 0.55) -> dict:
    n = len(invs)
    if n < 3:
        return {"method": "default", "threshold": default, "reason": "too few nodes (<3)"}
    sims = []
    for i in range(n):
        for j in range(i + 1, n):
            c = torch.nn.functional.cosine_similarity(
                invs[i].unsqueeze(0), invs[j].unsqueeze(0)).item()
            sims.append(c)
    if len(sims) < 20:
        return {"method": "default", "threshold": default, "reason": f"too few pairs ({len(sims)}<20)"}
    # Otsu: гистограмма косинусов в [-1,1]
    lo, hi = min(sims), max(sims)
    if hi - lo < 1e-3:
        return {"method": "default", "threshold": default, "reason": "degenerate distribution"}
    bins = 64
    counts, edges = torch.histogram(torch.tensor(sims), bins=bins, range=(lo, hi + 1e-6))
    counts = counts.numpy()
    total = counts.sum()
    best_t, best_var = lo, -1.0
    cum = 0
    cum_sum = 0.0
    sum_all = sum((k + 0.5) * counts[k] for k in range(bins))
    cum_count = 0
    for k in range(bins):
        cum_count += counts[k]
        if cum_count == 0 or cum_count == total:
            continue
        w0 = cum_count / total
        w1 = 1 - w0
        mu0 = sum((j + 0.5) * counts[j] for j in range(k + 1)) / cum_count
        mu1 = (sum_all - sum((j + 0.5) * counts[j] for j in range(k + 1))) / (total - cum_count)
        var_between = w0 * w1 * (mu0 - mu1) ** 2
        if var_between > best_var:
            best_var = var_between
            best_t = edges[k + 1].item()
    if best_t < floor:
        return {"method": "clamped_otsu", "threshold": floor, "otsu_raw": round(best_t, 4),
                "reason": f"otsu below floor {floor}; distribution may be unimodal/untrained"}
    return {"method": "otsu", "threshold": round(best_t, 4),
            "n_pairs": len(sims), "cos_min": round(lo, 4), "cos_max": round(hi, 4)}


# ---------------------------------------------------------------------------
# Real-time session
# ---------------------------------------------------------------------------
class RealtimeSession:
    def __init__(self, ckpt_path: str, encoder=None, crystal_store: str = None,
                 ground_truth_domains: bool = False):
        self.core = MMSSCore()
        ck = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        self.core._hyper.load_state_dict(ck["hyper_state_dict"])
        self.hyper_trained = True
        self.encoder = encoder or feature_hash_encoder
        self.crystal_store = Path(crystal_store) if crystal_store else None
        if self.crystal_store:
            self.crystal_store.parent.mkdir(parents=True, exist_ok=True)
            self.crystal_store.touch()
        self.ground_truth_domains = ground_truth_domains  # для оценки в демо

        self.nodes = []          # [{id, text, z_q, inv, domains?}]
        self.invs = []           # тензоры инвариантов
        self.adaptive = {"method": "default", "threshold": 0.85, "reason": "init"}
        self.events = []         # UI event log
        self.crystals = []       # материализованные кристаллы
        self.bridge_node_ids = set()
        self.transitions = []

    def _stable_threshold(self):
        return max(self.adaptive["threshold"], 0.90)

    def _stable_clusters(self):
        """Плотные кластеры (emergent voices) при stable_threshold."""
        thr = self._stable_threshold()
        n = len(self.invs)
        if n == 0:
            return [], {}
        parent = list(range(n))

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for i in range(n):
            for j in range(i + 1, n):
                c = torch.nn.functional.cosine_similarity(
                    self.invs[i].unsqueeze(0), self.invs[j].unsqueeze(0)).item()
                if c > thr:
                    parent[find(i)] = find(j)
        comps = defaultdict(list)
        for i in range(n):
            comps[find(i)].append(i)
        # стабильные кластеры = размер >=2; строим карту узел->индекс кластера
        clusters = [m for m in comps.values() if len(m) >= 2]
        node_cluster = {}
        for ci, members in enumerate(clusters):
            for m in members:
                node_cluster[m] = ci
        return clusters, node_cluster

    def _node_clusters(self, node_idx, clusters, node_cluster):
        """каким stable-кластерам близок узел: считаем соседей на ADAPTIVE-пороге
        и отображаем их на stable-кластеры. Мост (blend) имеет умеренный косинус
        к кластерам (~0.4-0.6) и не достигнет stable-порога, но на adaptive-пороге
        соединяет членов разных кластеров."""
        thr = self.adaptive["threshold"]
        touched = set()
        for j in range(len(self.invs)):
            if j == node_idx:
                continue
            c = torch.nn.functional.cosine_similarity(
                self.invs[node_idx].unsqueeze(0), self.invs[j].unsqueeze(0)).item()
            if c > thr and j in node_cluster:
                touched.add(node_cluster[j])
        return sorted(touched)

    def ingest(self, text: str) -> dict:
        t0 = time.perf_counter()
        node_id = uuid.uuid4().hex[:10]
        z_q = self.encoder(text, self.core.emb_dim)
        w_q = self.core.hypernet(z_q)
        inv = self.core.compute_invariant(z_q, w_q)
        self.invs.append(inv)
        domains = query_domains(text) if self.ground_truth_domains else set()
        self.nodes.append({"id": node_id, "text": text, "domains": sorted(domains)})

        # пересчёт адаптивного threshold
        self.adaptive = adaptive_threshold(self.invs)

        # stable clusters ДО добавления узла в мосты (на текущем полном графе)
        clusters, node_cluster = self._stable_clusters()

        # ⊘ bridge detection для нового узла
        touched_clusters = self._node_clusters(len(self.nodes) - 1, clusters, node_cluster)
        is_bridge = len(touched_clusters) >= 2

        cycle = {
            "schema_version": "1.0.0",
            "cycle_id": node_id,
            "source_query": {"raw": text, "kind": "graph_node"},
            "z_q": {"dim": self.core.emb_dim, "norm": round(float(z_q.norm().item()), 5)},
            "operators": {
                "H_hypernet": {"w_q_hash": hashlib.sha256(w_q.detach().numpy().tobytes()).hexdigest()[:16],
                               "w_q_dim": int(w_q.numel()), "loaded_from_checkpoint": self.hyper_trained},
                "invariant_computation": True,
                "isomorphism_detection": {"found": is_bridge, "touched_clusters": len(touched_clusters)},
                "phase_transition": {"triggered": False},
            },
            "invariant": {
                "dim": self.core.inv_out,
                "dominant_axis": int(torch.argmax(inv.abs()).item()),
                "magnitude_pct": round(float(inv.abs().max().item()) * 100, 4),
                "polarity": "positive" if inv[int(torch.argmax(inv.abs()).item())].item() >= 0 else "negative",
            },
            "crystal": {"crystal_id": None, "type": None, "stored": False},
            "render_outputs": self.core.render(inv),
            "metrics": {"latency_ms": round((time.perf_counter() - t0) * 1000, 3),
                        "param_count": self.core.model_metrics()["param_count"]},
        }

        event = {"node_id": node_id, "text": text, "latency_ms": cycle["metrics"]["latency_ms"],
                 "adaptive_threshold": self.adaptive, "is_bridge": is_bridge,
                 "n_stable_clusters": len(clusters), "touched_clusters": touched_clusters}

        # ↯ phase transition: мост объединил >=2 ранее отдельных stable-кластера
        if is_bridge:
            self.bridge_node_ids.add(node_id)
            cycle["operators"]["phase_transition"] = {
                "triggered": True,
                "merged_clusters": len(touched_clusters),
            }
            event["phase_transition"] = True
            self.transitions.append({"node_id": node_id, "text": text,
                                     "merged_clusters": len(touched_clusters)})
            # материализация кристалла 'paradox'
            crystal = self._materialize_crystal(text, inv, touched_clusters, cycle)
            cycle["crystal"] = {
                "crystal_id": crystal["crystal_id"],
                "type": "paradox",
                "stored": True,
                "store": "local_meta_crystal_compatible_jsonl",
            }
            self.crystals.append(crystal)

        self.events.append(event)
        return {"cycle": cycle, "event": event}

    def _materialize_crystal(self, text, inv, touched_clusters, cycle):
        cid = "crys_" + uuid.uuid4().hex[:10]
        dom = cycle["invariant"]["dominant_axis"]
        rec = {
            "crystal_id": cid,
            "type": "paradox",
            "source_query": text,
            "invariant": [round(x, 5) for x in inv.tolist()],
            "dominant_axis": dom,
            "magnitude_pct": cycle["invariant"]["magnitude_pct"],
            "touched_clusters": touched_clusters,
            "render": cycle["render_outputs"],
            "timestamp_unix": time.time(),
        }
        if self.crystal_store:
            with open(self.crystal_store, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec

    def ui_snapshot(self):
        clusters, _ = self._stable_clusters()
        return {
            "panel_autonomous_isomorphisms_⊘": {
                "bridges_found": len(self.bridge_node_ids),
                "bridge_node_ids": sorted(self.bridge_node_ids),
            },
            "panel_phase_transitions_↯": {
                "count": len(self.transitions),
                "events": self.transitions,
            },
            "panel_emergent_voices": {
                "n_clusters": len(clusters),
                "clusters": [{"size": len(c), "members_sample": c[:3]} for c in clusters],
            },
            "adaptive_threshold": self.adaptive,
            "scale_caveat": "all-pairs cosine OK до сотен/тысяч узлов; для роста нужен ANN/HNSW/FAISS/векторное расширение",
            "n_nodes": len(self.nodes),
            "n_crystals_materialized": len(self.crystals),
            "crystal_store": str(self.crystal_store) if self.crystal_store else None,
        }


# ---------------------------------------------------------------------------
# Демо: поток узлов в реальном времени
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import random
    random.seed(SEED)
    torch.manual_seed(SEED)

    ckpt = "/home/user/workspace/mmss/v22_hyper_synthetic_distilled.pt"
    store = "/home/user/workspace/mmss/crystals.jsonl"
    # wipe store
    open(store, "w").close()

    session = RealtimeSession(ckpt, crystal_store=store, ground_truth_domains=True)

    # поток: in-distribution текст (как при обучении ℋ), чтобы feature-hash
    # попадал в обученный манифольд. На новых формулировках feature-hash
    # размывает доменный сигнал — это известное ограничение, которое
    # устраняется Ollama-энкодером (подключается локально позже).
    DV = __import__("mmss_distill_isomorphism").DOMAIN_VOCAB
    stream = []
    for d in DOMAINS:
        for i in range(8):
            kw = random.sample(DV[d], k=min(2, len(DV[d])))
            stream.append(f"{d} probe {i} " + " ".join(kw) + f" seed{random.randint(0,9999)}")
    # мосты в конце потока (вызовут ↯)
    for i in range(8):
        d1, d2 = random.sample(DOMAINS, 2)
        k1 = random.choice(DV[d1])
        k2 = random.choice(DV[d2])
        stream.append(f"bridge {i} {k1} {k2} link{random.randint(0,9999)}")
    random.shuffle(stream[:48])  # перемешать однодоменные
    # мосты остаются в конце для наглядности ↯

    print(f"streaming {len(stream)} nodes into Mosaic-Topologies realtime session...")
    for txt in stream:
        session.ingest(txt)

    snap = session.ui_snapshot()
    print(json.dumps(snap, ensure_ascii=False, indent=2))

    out = {
        "engine": "MMSS_INVARIANT_MANIFOLD_ENGINE",
        "version": "v2.2-realtime-session",
        "runtime": {"torch": torch.__version__, "cpu_only": True},
        "config": {
            "hypernetwork_source": "checkpoint v22_hyper_synthetic_distilled.pt",
            "encoder": "feature_hash (Ollama-swap-ready via pluggable encoder)",
            "crystal_store": str(store),
            "crystal_store_is": "local Meta-Crystal-compatible JSONL simulation (URL4 is a deployed app, not written into)",
        },
        "ui_snapshot": snap,
        "sample_events": session.events[:3] + (session.events[-3:] if len(session.events) > 3 else []),
        "sample_crystals": session.crystals[:3],
        "n_total_events": len(session.events),
    }
    with open("/home/user/workspace/mmss/v22_realtime_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\nresults -> /home/user/workspace/mmss/v22_realtime_results.json")
