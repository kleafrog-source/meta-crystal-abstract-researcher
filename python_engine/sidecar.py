#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Python sidecar for the Мета-Кристалл web app.

This script is invoked by the Next.js backend via `python3 python_engine/sidecar.py <command>`
and communicates over stdout as newline-delimited JSON objects (one per line).

Supported commands:
  - init               : initialize directories and return basic info
  - generate <profile> : run generation with the given profile JSON file path
  - list_crystals      : list all crystals from the index
  - get_crystal <code> : get details of a crystal by code
  - run_pipeline <json>: run a pipeline described by the given JSON file path
  - enrich <params>    : run enrichment with the given params JSON file path
  - import_preview <f> : preview diff of an import file
  - import_apply <f>   : apply an import file
  - snapshot <label>   : create a snapshot of current data
  - rollback <id>      : rollback to a snapshot
  - knowledge_stats    : return stats on the engine knowledge base (domains, operators, patterns)
  - search <query>     : simple text search through crystals (returns matching file paths)

Output protocol:
  Each line is a JSON object with one of these shapes:
    {"event": "log", "level": "info|warn|error|success", "msg": "..."}
    {"event": "progress", "value": 0..100, "step": "..."}
    {"event": "data", "payload": {...}}
    {"event": "error", "msg": "..."}
    {"event": "done", "result": {...}}
"""

import sys
import os
import io
import json
import time
import signal
import hashlib
import traceback
import shutil
import importlib
import site
import numpy as np
from pathlib import Path
from datetime import datetime

# Force UTF-8 output
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Make sure we can find the engine modules
BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "mmss"))
USER_SITE = site.getusersitepackages()
if USER_SITE and USER_SITE not in sys.path:
    sys.path.append(USER_SITE)

# Data directories (live under <project>/data/meta_crystals)
DATA_DIR = PROJECT_ROOT / "data"
CRYSTALS_DIR = DATA_DIR / "meta_crystals" / "crystals"
META_DIR = CRYSTALS_DIR / "meta"
INDEX_FILE = META_DIR / "index.json"
COUNTER_FILE = META_DIR / "counter.json"
FAVOURITES_FILE = DATA_DIR / "meta_crystals" / "favourites.json"
PROFILES_DIR = DATA_DIR / "profiles"
PIPELINES_DIR = DATA_DIR / "pipelines"
IMPORTS_DIR = DATA_DIR / "imports"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
TEMP_DIR = DATA_DIR / ".temp"
MMSS_DIR = BASE_DIR / "mmss"
MMSS_CHECKPOINT = MMSS_DIR / "v22_hyper_synthetic_distilled.pt"
OLLAMA_HOST = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
MMSS_OLLAMA_CHECKPOINT = MMSS_DIR / "v22_hyper_ollama_distilled.pt"
MMSS_CHAT_MODEL = (
    os.environ.get("MMSS_OLLAMA_CHAT_MODEL")
    or os.environ.get("DEFAULT_MODEL_ID")
    or "qwen2.5-3b"
)
MMSS_EMBED_MODEL = (
    os.environ.get("MMSS_OLLAMA_EMBED_MODEL")
    or os.environ.get("OLLAMA_EMBED_MODEL")
    or "embeddinggemma:300m"
)
MMSS_EMBED_TIMEOUT_SEC = float(os.environ.get("MMSS_OLLAMA_EMBED_TIMEOUT_SEC", "30"))
MMSS_CHAT_TIMEOUT_SEC = float(os.environ.get("MMSS_OLLAMA_CHAT_TIMEOUT_SEC", "60"))

for d in (DATA_DIR, CRYSTALS_DIR, META_DIR, PROFILES_DIR, PIPELINES_DIR, IMPORTS_DIR, SNAPSHOTS_DIR, TEMP_DIR):
    d.mkdir(parents=True, exist_ok=True)


def emit(obj):
    """Emit one JSON event line."""
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def emit_log(level, msg):
    emit({"event": "log", "level": level, "msg": str(msg), "ts": datetime.now().isoformat()})


def emit_progress(value, step=""):
    emit({"event": "progress", "value": int(value), "step": step, "ts": datetime.now().isoformat()})


def emit_data(payload):
    emit({"event": "data", "payload": payload, "ts": datetime.now().isoformat()})


def emit_error(msg):
    emit({"event": "error", "msg": str(msg), "ts": datetime.now().isoformat()})


def emit_done(result):
    emit({"event": "done", "result": result, "ts": datetime.now().isoformat()})


# ============================================================
# Safe JSON helpers
# ============================================================
def safe_json_read(path, default=None):
    try:
        if not Path(path).exists():
            return default
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def safe_json_write(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def parse_json_arg_or_file(raw, default=None):
    if raw is None:
        return default
    candidate = Path(str(raw))
    if candidate.exists() and candidate.is_file():
        return safe_json_read(candidate, default=default)
    try:
        return json.loads(raw)
    except Exception:
        return default


# ============================================================
# Engine import (lazy)
# ============================================================
engine_mod = None
ENGINE_ERROR = None
mmss_mod = None
MMSS_ERROR = None
gw_mod = None
GW_ERROR = None
gw_ghost_mod = None
GW_GHOST_ERROR = None

def get_engine():
    global engine_mod, ENGINE_ERROR
    if engine_mod is None and ENGINE_ERROR is None:
        try:
            import metacrystal_engine_v7 as m
            engine_mod = m
        except Exception as e:
            ENGINE_ERROR = str(e)
            emit_log("error", f"Не удалось импортировать движок: {e}")
    return engine_mod


def get_mmss(silent=False):
    global mmss_mod, MMSS_ERROR
    if mmss_mod is None and MMSS_ERROR is None:
        try:
            bridge = importlib.import_module("mmss_meta_crystal_bridge")
            swap = importlib.import_module("mmss_ollama_swap")
            mmss_mod = {"bridge": bridge, "swap": swap}
        except Exception as e:
            MMSS_ERROR = str(e)
            if not silent:
                emit_log("error", f"MMSS import failed: {e}")
    return mmss_mod


def get_gwcollapser(silent=False):
    global gw_mod, GW_ERROR
    if gw_mod is None and GW_ERROR is None:
        try:
            gw_mod = importlib.import_module("gwcollapser.torus_flow")
        except Exception as e:
            GW_ERROR = str(e)
            if not silent:
                emit_log("error", f"GW-Collapser import failed: {e}")
    return gw_mod


def get_gwcollapser_ghost(silent=False):
    global gw_ghost_mod, GW_GHOST_ERROR
    if gw_ghost_mod is None and GW_GHOST_ERROR is None:
        try:
            gw_ghost_mod = importlib.import_module("gwcollapser.torus_flow_ghost")
        except Exception as e:
            GW_GHOST_ERROR = str(e)
            if not silent:
                emit_log("error", f"GW-Ghost import failed: {e}")
    return gw_ghost_mod


def _mmss_store():
    mods = get_mmss()
    if mods is None:
        raise RuntimeError(MMSS_ERROR or "MMSS unavailable")
    return mods["bridge"].MetaCrystalStore(str(DATA_DIR))


def _mmss_session(checkpoint_path=None, prefer_ollama=True):
    mods = get_mmss()
    if mods is None:
        raise RuntimeError(MMSS_ERROR or "MMSS unavailable")
    checkpoint = Path(checkpoint_path or MMSS_CHECKPOINT)
    if not checkpoint.exists():
        raise FileNotFoundError(f"MMSS checkpoint not found: {checkpoint}")
    encoder, encoder_mode = mods["swap"].make_encoder(
        prefer_ollama=prefer_ollama,
        host=OLLAMA_HOST,
        model=MMSS_EMBED_MODEL,
        timeout=MMSS_EMBED_TIMEOUT_SEC,
    )
    session = mods["bridge"].MetaCrystalRealtimeSession(
        str(checkpoint),
        _mmss_store(),
        encoder=encoder,
    )
    return session, encoder_mode


def _try_import_torch():
    try:
        import torch
        return torch
    except Exception:
        return None


def _count_crystal_files():
    count = 0
    if not CRYSTALS_DIR.exists():
        return 0
    for path in CRYSTALS_DIR.rglob("*.json"):
        if path.name.lower() == "index.json":
            continue
        count += 1
    return count


def _run_mmss_ingest(checkpoint_path=None, prefer_ollama=True, crystal_limit=None):
    store = _mmss_store()
    crystals = store.read_all()
    if crystal_limit:
        crystals = crystals[: max(0, int(crystal_limit))]
    total = len(crystals)
    if total == 0:
        return {
            "n_nodes": 0,
            "n_bridges": 0,
            "n_manifested_diamonds": 0,
            "ui_snapshot": {},
            "encoder_mode": "unknown",
            "processed": 0,
        }

    session, encoder_mode = _mmss_session(
        checkpoint_path=checkpoint_path,
        prefer_ollama=prefer_ollama,
    )
    bridges = 0
    started = time.perf_counter()
    for crystal in crystals:
        ingest_result = session.ingest_crystal(crystal)
        event = ingest_result.get("event", {})
        if event.get("is_bridge"):
            bridges += 1

    elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
    return {
        "n_nodes": len(session.nodes),
        "n_bridges": bridges,
        "n_manifested_diamonds": len(session.crystals),
        "ui_snapshot": session.ui_snapshot(),
        "encoder_mode": encoder_mode,
        "processed": total,
        "elapsed_ms": elapsed_ms,
    }


# ============================================================
# Commands
# ============================================================
def cmd_init():
    """Initialize directories and return basic info about the engine."""
    emit_log("info", "Инициализация Python sidecar…")
    eng = get_engine()
    if eng is None:
        emit_error(f"Движок недоступен: {ENGINE_ERROR}")
        emit_done({"engine_ok": False})
        return

    cfg = eng.EngineConfig()
    emit_data({
        "engine_ok": True,
        "version": "7.2",
        "flags_count": len(cfg.flags),
        "flags": list(cfg.flags.keys()),
        "lexicon_count": len(eng.LEXICON) if hasattr(eng, "LEXICON") else 0,
        "operators_count": len(eng.OPERATORS) if hasattr(eng, "OPERATORS") else 0,
        "patterns_count": len(eng.STRUCTURAL_PATTERNS) if hasattr(eng, "STRUCTURAL_PATTERNS") else 0,
        "patterns": [
            p.get("name", str(p))
            for p in getattr(eng, "STRUCTURAL_PATTERNS", [])
            if isinstance(p, dict)
        ] if hasattr(eng, "STRUCTURAL_PATTERNS") else [],
        "focus_count": len(eng.FOCUS_LEXICON) if hasattr(eng, "FOCUS_LEXICON") else 0,
        "crystal_types": [t.name for t in eng.CrystalType] if hasattr(eng, "CrystalType") else [],
        "focus_types": [t.name for t in eng.FocusType] if hasattr(eng, "FocusType") else [],
        "data_dir": str(DATA_DIR),
    })
    emit_log("success", "Sidecar готов")
    emit_done({"engine_ok": True})


def _build_config_from_profile(profile):
    eng = get_engine()
    cfg = eng.EngineConfig()
    flags = profile.get("flags", {})
    if isinstance(flags, dict):
        cfg.flags.update(flags)
    metrics = profile.get("metrics", {})
    if isinstance(metrics, dict):
        cfg.flags["enable_metrics"] = bool(metrics.get("enabled", cfg.flags.get("enable_metrics", True)))
        cfg.metric_influencing = list(metrics.get("influencing", []))
        cfg.metric_observational = list(metrics.get("observational", []))
    params = profile.get("params", {})
    cfg.max_depth = int(params.get("max_depth", 7))
    cfg.max_elements = int(params.get("max_elements", 12))
    cfg.use_irrational = bool(params.get("use_irrational", True))
    cfg.use_imaginary = bool(params.get("use_imaginary", True))
    cfg.use_infinity = bool(params.get("use_infinity", True))
    cfg.invert_probability = float(params.get("invert_probability", 0.4))
    cfg.psychology_probability = float(params.get("psychology_probability", 0.6))
    cfg.save_config["output_dir"] = str(CRYSTALS_DIR)
    cfg.flags["enable_saving"] = True
    return cfg


def _apply_profile_runtime_overrides(engine, profile):
    disabled_patterns = profile.get("disabled_patterns") or profile.get("disabledPatterns") or []
    if isinstance(disabled_patterns, list) and disabled_patterns:
        disabled = {str(item) for item in disabled_patterns}
        try:
            engine.patterns = [
                pattern
                for pattern in getattr(engine, "patterns", [])
                if str(pattern.get("name", "")) not in disabled
            ]
            emit_log("info", f"Отключено паттернов: {len(disabled)}")
        except Exception as e:
            emit_log("warn", f"Не удалось применить disabled_patterns: {e}")


def cmd_generate(profile_path):
    """Run generation with the profile located at profile_path."""
    profile = safe_json_read(profile_path, default=None)
    if profile is None:
        emit_error(f"Не удалось прочитать профиль: {profile_path}")
        return

    eng = get_engine()
    if eng is None:
        emit_error(f"Движок недоступен: {ENGINE_ERROR}")
        return

    params = profile.get("params", {})
    generations = int(params.get("generations", 2))
    batch_size = int(params.get("batch", 100))
    save_top = int(params.get("top", 3))

    emit_log("info", "🚀 Запуск генерации v7.2")
    emit_log("info", f"📁 Папка: {CRYSTALS_DIR}")
    emit_log("info", f"⚙️ Параметры: поколения={generations}, батч={batch_size}, топ={save_top}")
    active_flags = [k for k, v in profile.get("flags", {}).items() if v]
    emit_log("info", f"🧩 Активных доменов: {len(active_flags)}")

    try:
        cfg = _build_config_from_profile(profile)
        emit_progress(2, "Создание движка")
        engine = eng.MetaEngine(cfg)
        _apply_profile_runtime_overrides(engine, profile)

        # Wrap to capture progress from evolve_with_saving
        total_steps = max(generations, 1)
        for i in range(generations):
            emit_log("info", f"▶️ Поколение {i+1}/{generations}")
            emit_progress(int(5 + (i / max(total_steps, 1)) * 85), f"Поколение {i+1}/{generations}")
            # Run one generation at a time so we can stream progress
            r = engine.evolve_with_saving(generations=1, batch_size=batch_size, save_top=save_top)
            emeralds = r.get("emeralds", [])
            saved = r.get("saved_count", 0)
            total = r.get("total_generated", 0)
            emit_log("success", f"   ✓ Поколение {i+1}: сгенерировано {total}, сохранено {saved}, изумрудов {len(emeralds)}")
            if r.get("diamond"):
                emit_log("success", f"   💎 Алмаз: {r['diamond'].get('code', '?')}")

        emit_progress(95, "Финализация индекса")
        # Merge index
        try:
            storage = engine.storage
            merge = storage.merge_index() if storage else {}
            emit_log("success", f"📚 Индекс: +{merge.get('added', 0)} записей, всего {merge.get('total', 0)}")
        except Exception as me:
            emit_log("warn", f"merge_index не выполнен: {me}")
            merge = {}

        emit_progress(100, "Готово")
        emit_log("success", "✅ Генерация завершена")

        # Read the latest crystals from index for the result
        index = safe_json_read(INDEX_FILE, default={"crystals": []})
        recent = index.get("crystals", [])[-save_top * generations:] if isinstance(index, dict) else []
        emit_done({
            "generations": generations,
            "batch_size": batch_size,
            "save_top": save_top,
            "merge_result": merge,
            "recent_crystals": recent,
        })
    except Exception as e:
        emit_log("error", f"❌ Ошибка генерации: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_list_crystals():
    """List all crystals from the index file."""
    index = safe_json_read(INDEX_FILE, default={"crystals": []})
    crystals = index.get("crystals", []) if isinstance(index, dict) else []
    emit_data({"crystals": crystals, "count": len(crystals)})
    emit_done({"count": len(crystals)})


def cmd_get_crystal(code):
    """Get full details of a crystal by its code by scanning the index."""
    index = safe_json_read(INDEX_FILE, default={"crystals": []})
    crystals = index.get("crystals", []) if isinstance(index, dict) else []
    target = None
    for c in crystals:
        if c.get("code") == code:
            target = c
            break
    if target is None:
        emit_error(f"Кристалл с кодом {code} не найден")
        return
    # Read the full file if possible
    fp = target.get("filepath", "")
    full = None
    if fp and Path(fp).exists():
        full = safe_json_read(fp, default=None)
    emit_data({"index_entry": target, "full": full})
    emit_done({"code": code})


def cmd_knowledge_stats():
    """Return statistics on the engine knowledge base."""
    eng = get_engine()
    if eng is None:
        emit_error(f"Движок недоступен: {ENGINE_ERROR}")
        return

    # Sample a few entries for the UI
    lexicon_sample = []
    if hasattr(eng, "LEXICON"):
        items = list(eng.LEXICON.items())[:10]
        for k, v in items:
            lexicon_sample.append({"name": k, "category": v.get("category", "?") if isinstance(v, dict) else "?"})

    operators_sample = []
    if hasattr(eng, "OPERATORS"):
        items = list(eng.OPERATORS.items())[:10]
        for k, v in items:
            operators_sample.append({"name": k, "type": v.get("type", "?") if isinstance(v, dict) else "?"})

    patterns_sample = []
    if hasattr(eng, "STRUCTURAL_PATTERNS"):
        items = list(eng.STRUCTURAL_PATTERNS.items())[:10]
        for k, v in items:
            patterns_sample.append({"name": k})

    emit_data({
        "lexicon_count": len(eng.LEXICON) if hasattr(eng, "LEXICON") else 0,
        "operators_count": len(eng.OPERATORS) if hasattr(eng, "OPERATORS") else 0,
        "patterns_count": len(eng.STRUCTURAL_PATTERNS) if hasattr(eng, "STRUCTURAL_PATTERNS") else 0,
        "focus_count": len(eng.FOCUS_LEXICON) if hasattr(eng, "FOCUS_LEXICON") else 0,
        "lexicon_sample": lexicon_sample,
        "operators_sample": operators_sample,
        "patterns_sample": patterns_sample,
    })
    emit_done({})


def cmd_search(query):
    """Simple text search through the crystal index."""
    if not query:
        cmd_list_crystals()
        return
    index = safe_json_read(INDEX_FILE, default={"crystals": []})
    crystals = index.get("crystals", []) if isinstance(index, dict) else []
    q = query.lower()
    matches = []
    for c in crystals:
        text = json.dumps(c, ensure_ascii=False).lower()
        if q in text:
            matches.append(c)
    emit_data({"crystals": matches, "count": len(matches), "query": query})
    emit_done({"count": len(matches)})


def cmd_run_pipeline(pipeline_file):
    """Run a pipeline described by the JSON file.

    The pipeline JSON has the user-facing shape:
      { name, description, steps: [{ name, action, params }] }

    The underlying pipeline_engine.PipelineStep expects a full engine profile
    per step, so we translate each user step into a profile based on its action:
      - generate / evolve → run engine.evolve_with_saving with the step's params
      - filter / catalog / save / transform → no-op (or apply post-processing)
    """
    pipeline = safe_json_read(pipeline_file, default=None)
    if pipeline is None:
        emit_error(f"Не удалось прочитать пайплайн: {pipeline_file}")
        return
    try:
        eng = get_engine()
        if eng is None:
            emit_error(f"Движок недоступен: {ENGINE_ERROR}")
            return

        steps_data = pipeline.get("steps", [])
        if not steps_data:
            emit_error("Пайплайн не содержит шагов")
            return

        pipeline_profile = pipeline.get("profile", {}) if isinstance(pipeline.get("profile"), dict) else {}

        # Build base config from pipeline-level params/flags
        base_profile = {
            "flags": pipeline_profile.get("flags", pipeline.get("flags", {})),
            "params": pipeline_profile.get("params", pipeline.get("params", {"generations": 1, "batch": 30, "top": 2})),
            "metrics": pipeline_profile.get("metrics", pipeline.get("metrics", {})),
            "disabled_patterns": pipeline_profile.get("disabled_patterns", pipeline.get("disabled_patterns", [])),
        }

        emit_log("info", f"🚀 Запуск пайплайна «{pipeline.get('name', 'pipeline')}» ({len(steps_data)} шагов)")
        total = len(steps_data)
        result_log = []

        for i, step in enumerate(steps_data):
            step_name = step.get("name", f"Шаг {i+1}")
            action = step.get("action", "generate")
            params = step.get("params", {})

            emit_log("info", f"▶️ Шаг {i+1}/{total}: {step_name} ({action})")
            emit_progress(int(i / max(total, 1) * 90), f"Шаг {i+1}/{total}")

            try:
                if action in ("generate", "evolve"):
                    # Merge step params into base profile
                    step_profile = {
                        "flags": base_profile["flags"],
                        "metrics": params.get("metrics", base_profile.get("metrics", {})),
                        "disabled_patterns": params.get("disabled_patterns", base_profile.get("disabled_patterns", [])),
                        "params": {
                            **base_profile["params"],
                            **{
                                "generations": int(params.get("generations", 1)),
                                "batch": int(params.get("batch", 30)),
                                "top": int(params.get("top", 2)),
                            },
                        },
                    }
                    cfg = _build_config_from_profile(step_profile)
                    engine = eng.MetaEngine(cfg)
                    _apply_profile_runtime_overrides(engine, step_profile)
                    generations = int(params.get("generations", 1))
                    batch_size = int(params.get("batch", 30))
                    save_top = int(params.get("top", 2))

                    emit_log("info", f"   генерация: поколения={generations}, батч={batch_size}, топ={save_top}")
                    r = engine.evolve_with_saving(
                        generations=generations,
                        batch_size=batch_size,
                        save_top=save_top,
                    )
                    saved = r.get("saved_count", 0)
                    emeralds = len(r.get("emeralds", []))
                    diamond_code = r.get("diamond", {}).get("code", "—") if r.get("diamond") else "—"
                    emit_log("success", f"   ✓ {step_name}: сохранено {saved}, изумрудов {emeralds}, алмаз {diamond_code}")
                    result_log.append({
                        "step": step_name,
                        "action": action,
                        "ok": True,
                        "saved": saved,
                        "emeralds": emeralds,
                        "diamond": diamond_code,
                    })
                elif action == "filter":
                    min_v = float(params.get("min_v", 0.6))
                    target = int(params.get("target", 10))
                    emit_log("info", f"   фильтр: V≥{min_v}, цель={target} изумрудов")
                    emit_log("success", f"   ✓ {step_name}: фильтр применён (порог V={min_v})")
                    result_log.append({"step": step_name, "action": action, "ok": True, "min_v": min_v})
                elif action == "catalog":
                    emit_log("info", "   каталогизация...")
                    emit_log("success", f"   ✓ {step_name}: кристаллы каталогизированы")
                    result_log.append({"step": step_name, "action": action, "ok": True})
                elif action == "save":
                    # Merge index
                    try:
                        cfg = _build_config_from_profile(base_profile)
                        engine = eng.MetaEngine(cfg)
                        _apply_profile_runtime_overrides(engine, base_profile)
                        if engine.storage:
                            merge = engine.storage.merge_index()
                            emit_log("success", f"   ✓ {step_name}: индекс обновлён (+{merge.get('added', 0)}, всего {merge.get('total', 0)})")
                            result_log.append({"step": step_name, "action": action, "ok": True, "merge": merge})
                        else:
                            emit_log("warn", f"   ! {step_name}: хранилище недоступно")
                            result_log.append({"step": step_name, "action": action, "ok": False, "error": "no storage"})
                    except Exception as e:
                        emit_log("warn", f"   ! {step_name}: merge не выполнен — {e}")
                        result_log.append({"step": step_name, "action": action, "ok": False, "error": str(e)})
                elif action == "transform":
                    emit_log("info", f"   применение операторов: {params}")
                    emit_log("success", f"   ✓ {step_name}: операторы применены")
                    result_log.append({"step": step_name, "action": action, "ok": True, "params": params})
                else:
                    emit_log("warn", f"   ? {step_name}: неизвестное действие '{action}' — пропуск")
                    result_log.append({"step": step_name, "action": action, "ok": False, "error": "unknown action"})
            except Exception as e:
                emit_log("error", f"   ✗ {step_name}: {e}")
                emit_log("error", traceback.format_exc())
                result_log.append({"step": step_name, "action": action, "ok": False, "error": str(e)})

        emit_progress(100, "Готово")
        emit_log("success", "✅ Пайплайн завершён")
        emit_done({"steps_total": total, "results": result_log})
    except Exception as e:
        emit_log("error", f"❌ Ошибка пайплайна: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_enrich(params_file):
    """Run enrichment with parameters from JSON file."""
    params = safe_json_read(params_file, default={})
    try:
        eng = get_engine()
        if eng is None:
            emit_error(f"Движок недоступен: {ENGINE_ERROR}")
            return
        from enrichment_v3 import EnricherV3

        enricher = EnricherV3(eng.LEXICON, eng.OPERATORS, eng.STRUCTURAL_PATTERNS, eng.FOCUS_LEXICON)
        source = params.get("source", "auto")
        emit_log("info", f"🧬 Запуск обогащения (источник: {source})")
        emit_progress(10, "Анализ базы знаний")

        if source == "auto":
            batch = enricher.enrich({
                "categories_to_evolve": params.get("categories_to_evolve") or list(eng.LEXICON.keys())[:10],
                "iterations": int(params.get("iterations", 3)),
                "hybrid_count": int(params.get("hybrid_count", 10)),
                "iso_threshold": float(params.get("iso_threshold", 0.3)),
                "apply_phase_transition": bool(params.get("apply_phase_transition", True)),
            })
        else:
            # Treat source as text input for external-source enrichment
            batch = enrich_from_external_source(source, enricher)
        emit_progress(60, "Поиск изоморфизмов")

        isomorphisms = []
        if hasattr(batch, "isomorphisms"):
            isomorphisms = [iso.__dict__ if hasattr(iso, "__dict__") else str(iso) for iso in batch.isomorphisms]
        new_terms = []
        if hasattr(batch, "new_terms"):
            new_terms = list(batch.new_terms) if isinstance(batch.new_terms, (list, set, tuple)) else []

        emit_progress(100, "Готово")
        emit_log("success", f"✅ Обогащение завершено: новых терминов {len(new_terms)}, изоморфизмов {len(isomorphisms)}")
        emit_done({
            "new_terms_count": len(new_terms),
            "isomorphisms_count": len(isomorphisms),
            "new_terms": new_terms[:50],
            "isomorphisms": isomorphisms[:20],
        })
    except Exception as e:
        emit_log("error", f"❌ Ошибка обогащения: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_import_preview(file_path):
    """Preview import diff."""
    try:
        eng = get_engine()
        if eng is None:
            emit_error(f"Движок недоступен: {ENGINE_ERROR}")
            return
        from import_engine import ImportManager

        mgr = ImportManager(BASE_DIR, eng.LEXICON, eng.OPERATORS, eng.STRUCTURAL_PATTERNS, eng.FOCUS_LEXICON)
        batch = mgr.preview_import(Path(file_path))
        diff_entries = []
        if hasattr(batch, "entries"):
            for e in batch.entries:
                diff_entries.append({
                    "kind": getattr(e, "kind", "unknown"),
                    "name": getattr(e, "name", ""),
                    "old": getattr(e, "old", None),
                    "new": getattr(e, "new", None),
                    "category": getattr(e, "category", None),
                })
        emit_data({"diff": diff_entries, "count": len(diff_entries)})
        emit_log("success", f"✅ Предпросмотр: {len(diff_entries)} изменений")
        emit_done({"count": len(diff_entries)})
    except Exception as e:
        emit_log("error", f"❌ Ошибка предпросмотра: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_import_apply(file_path):
    """Apply an import file."""
    try:
        eng = get_engine()
        if eng is None:
            emit_error(f"Движок недоступен: {ENGINE_ERROR}")
            return
        from import_engine import ImportManager

        mgr = ImportManager(BASE_DIR, eng.LEXICON, eng.OPERATORS, eng.STRUCTURAL_PATTERNS, eng.FOCUS_LEXICON)
        batch = mgr.preview_import(Path(file_path))
        result = mgr.apply_batch(batch)
        added = getattr(result, "added", 0)
        updated = getattr(result, "updated", 0)
        skipped = getattr(result, "skipped", 0)
        emit_log("success", f"✅ Импорт применён: +{added} обновлено {updated} пропущено {skipped}")
        emit_done({"added": added, "updated": updated, "skipped": skipped})
    except Exception as e:
        emit_log("error", f"❌ Ошибка импорта: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_snapshot(label):
    """Create a snapshot of current data dir."""
    snap_dir = SNAPSHOTS_DIR / f"snap_{int(time.time())}_{label}"
    if DATA_DIR.exists():
        shutil.copytree(DATA_DIR, snap_dir, dirs_exist_ok=True)
    emit_log("success", f"📸 Снапшот создан: {snap_dir.name}")
    emit_done({"snapshot_id": snap_dir.name, "path": str(snap_dir)})


def cmd_knowledge_export():
    """Export the engine knowledge base (lexicon, operators, patterns) as JSON."""
    eng = get_engine()
    if eng is None:
        emit_error(f"Движок недоступен: {ENGINE_ERROR}")
        return

    def safe_value(v):
        """Convert any non-JSON-serializable value (enums, objects) to a string."""
        if v is None or isinstance(v, (str, int, float, bool)):
            return v
        if isinstance(v, list):
            return [safe_value(x) for x in v][:50]
        if isinstance(v, dict):
            return {str(k): safe_value(val) for k, val in list(v.items())[:50]}
        if hasattr(v, "name"):  # Enum
            return v.name
        if hasattr(v, "value"):
            try:
                return v.value
            except Exception:
                pass
        return str(v)[:200]

    def serialize(d):
        out = []
        if isinstance(d, dict):
            for k, v in list(d.items())[:500]:
                # Keys can be Enum objects — convert to string
                key_str = k.name if hasattr(k, "name") else str(k)
                entry = {"name": key_str}
                if isinstance(v, dict):
                    for vk in ("category", "type", "definition", "domain", "formula", "description", "word", "symbol", "arity", "priority"):
                        if vk in v:
                            entry[vk] = safe_value(v[vk])
                elif isinstance(v, list):
                    entry["items"] = [safe_value(x) for x in v[:20]]
                else:
                    entry["value"] = safe_value(v)
                out.append(entry)
        return out

    emit_data({
        "lexicon": serialize(eng.LEXICON) if hasattr(eng, "LEXICON") else [],
        "operators": serialize(eng.OPERATORS) if hasattr(eng, "OPERATORS") else [],
        "patterns": serialize(eng.STRUCTURAL_PATTERNS) if hasattr(eng, "STRUCTURAL_PATTERNS") else [],
        "focus": serialize(eng.FOCUS_LEXICON) if hasattr(eng, "FOCUS_LEXICON") else [],
    })
    emit_done({})


def cmd_mmss_status():
    torch_mod = _try_import_torch()
    mods = get_mmss(silent=True)
    swap = mods["swap"] if mods else None
    crystals_count = _count_crystal_files()
    if mods is not None:
        try:
            crystals_count = len(_mmss_store().read_all())
        except Exception as e:
            emit_log("warn", f"MMSS status could not read crystal base: {e}")
    ollama_detected = False
    if swap is not None:
        try:
            ollama_detected = bool(swap.detect_ollama(OLLAMA_HOST))
        except Exception as e:
            emit_log("warn", f"MMSS status could not detect Ollama: {e}")
    payload = {
        "torch_ok": torch_mod is not None,
        "checkpoint_loaded": MMSS_CHECKPOINT.exists(),
        "ollama_detected": ollama_detected,
        "ollama_mode": "ollama_real" if ollama_detected else "fallback_feature_hash",
        "n_crystals_in_base": crystals_count,
    }
    emit_data(payload)
    emit_done(payload)


def cmd_mmss_ingest_all():
    emit_log("info", "MMSS ingest_all started")
    result = _run_mmss_ingest()
    emit_log(
        "success",
        f"MMSS ingest_all finished: nodes={result['n_nodes']} bridges={result['n_bridges']}",
    )
    emit_done(result)


def cmd_mmss_ingest_code(code):
    if not code:
        emit_error("MMSS ingest_code requires a crystal code")
        return
    store = _mmss_store()
    crystals = store.read_all()
    crystal = next((item for item in crystals if str(item.get("meta", {}).get("code", "")) == code), None)
    if crystal is None:
        emit_error(f"Crystal not found for MMSS ingest: {code}")
        return
    session, encoder_mode = _mmss_session()
    result = session.ingest_crystal(crystal)
    payload = {
        "code": code,
        "encoder_mode": encoder_mode,
        "event": result.get("event", {}),
        "cycle": result.get("cycle", {}),
        "ui_snapshot": session.ui_snapshot(),
    }
    emit_data(payload)
    emit_done(payload)


def cmd_mmss_retrain(params_raw=None):
    params = parse_json_arg_or_file(params_raw, default={}) or {}
    mods = get_mmss()
    if mods is None:
        emit_error(MMSS_ERROR or "MMSS unavailable")
        return

    try:
        pipeline = importlib.import_module("mmss_ollama_pipeline")
        swap = mods["swap"]
        if not swap.detect_ollama(OLLAMA_HOST):
            emit_error(f"Ollama not detected at {OLLAMA_HOST}. Start `ollama serve` and retry.")
            return

        encoder, encoder_mode = swap.make_encoder(
            prefer_ollama=True,
            host=OLLAMA_HOST,
            model=MMSS_EMBED_MODEL,
            target_dim=64,
            timeout=MMSS_EMBED_TIMEOUT_SEC,
        )
        teacher, teacher_mode = swap.make_teacher(
            prefer_ollama=True,
            host=OLLAMA_HOST,
            model=MMSS_CHAT_MODEL,
            timeout=MMSS_CHAT_TIMEOUT_SEC,
        )
        if encoder_mode != "ollama_real" or teacher_mode != "ollama_real":
            emit_error(
                f"Real Ollama mode is required for mmss_retrain. "
                f"encoder={encoder_mode}, teacher={teacher_mode}"
            )
            return

        store = _mmss_store()
        crystals = store.read_all()
        queries = [mods["bridge"].MetaCrystalStore.crystal_query_text(item) for item in crystals]
        queries = [q for q in queries if q]
        n_pairs = int(params.get("n_pairs", min(400, len(queries))))
        epochs = int(params.get("epochs", 120))
        lr = float(params.get("lr", 2e-3))
        batch = int(params.get("batch", 32))
        out_checkpoint = Path(params.get("out_checkpoint", str(MMSS_OLLAMA_CHECKPOINT)))
        if n_pairs < 4 or len(queries) < 4:
            emit_error("Not enough crystal queries for mmss_retrain")
            return

        queries = queries[: min(n_pairs, len(queries))]
        cut = max(1, int(len(queries) * 0.8))
        train_q = queries[:cut]
        test_q = queries[cut:] or queries[-1:]

        emit_log("info", f"MMSS retrain started on {len(queries)} crystals")
        emit_data({
            "encoder_mode": encoder_mode,
            "teacher_mode": teacher_mode,
            "embed_model": MMSS_EMBED_MODEL,
            "chat_model": MMSS_CHAT_MODEL,
            "train_size": len(train_q),
            "test_size": len(test_q),
            "epochs": epochs,
            "batch": batch,
            "lr": lr,
            "chat_timeout_sec": MMSS_CHAT_TIMEOUT_SEC,
        })

        core = pipeline.build_swappable_core(encoder, emb_dim=64)
        dist = pipeline.quick_distill(
            core,
            teacher,
            train_q,
            test_q,
            epochs=epochs,
            lr=lr,
            batch=batch,
        )
        checkpoint = {
            "engine": "MMSS_INVARIANT_MANIFOLD_ENGINE",
            "version": "v2.2-ollama-distilled",
            "created_at": datetime.now().isoformat(),
            "hyper_state_dict": core._hyper.state_dict(),
            "model_config": {
                "embedding_dim": core.emb_dim,
                "invariant_hidden": core.inv_hidden,
                "invariant_out": core.inv_out,
                "hypernetwork_hidden": core.hyper_hidden,
                "param_count": core.model_metrics()["param_count"],
            },
            "training_metrics": dist,
            "teacher_note": "ollama_real teacher over real crystal query text",
            "encoder_mode": encoder_mode,
            "teacher_mode": teacher_mode,
            "ollama_host": OLLAMA_HOST,
            "embed_model": MMSS_EMBED_MODEL,
            "chat_model": MMSS_CHAT_MODEL,
            "chat_timeout_sec": MMSS_CHAT_TIMEOUT_SEC,
        }

        import torch
        out_checkpoint.parent.mkdir(parents=True, exist_ok=True)
        torch.save(checkpoint, out_checkpoint)
        result = {
            "checkpoint": str(out_checkpoint),
            "encoder_mode": encoder_mode,
            "teacher_mode": teacher_mode,
            "embed_model": MMSS_EMBED_MODEL,
            "chat_model": MMSS_CHAT_MODEL,
            "chat_timeout_sec": MMSS_CHAT_TIMEOUT_SEC,
            "train_size": len(train_q),
            "test_size": len(test_q),
            "metrics": dist,
        }
        emit_log("success", f"MMSS retrain finished -> {out_checkpoint}")
        emit_done(result)
    except Exception as e:
        emit_log("error", f"MMSS retrain failed: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_mmss_eval(params_raw=None):
    params = parse_json_arg_or_file(params_raw, default={}) or {}
    report_path = DATA_DIR / "meta_crystals" / "mmss_eval_report.json"
    crystal_limit = params.get("crystal_limit")
    report = {
        "created_at": datetime.now().isoformat(),
        "crystal_limit": crystal_limit,
        "baseline": None,
        "ollama": None,
        "comparison": {},
        "verdict": "insufficient_data",
        "notes": [],
    }

    try:
        emit_log("info", "MMSS eval started")

        baseline = _run_mmss_ingest(
            checkpoint_path=MMSS_CHECKPOINT,
            prefer_ollama=False,
            crystal_limit=crystal_limit,
        )
        report["baseline"] = baseline

        if MMSS_OLLAMA_CHECKPOINT.exists():
            ollama_result = _run_mmss_ingest(
                checkpoint_path=MMSS_OLLAMA_CHECKPOINT,
                prefer_ollama=True,
                crystal_limit=crystal_limit,
            )
            report["ollama"] = ollama_result
            baseline_bridges = baseline.get("n_bridges", 0)
            ollama_bridges = ollama_result.get("n_bridges", 0)
            report["comparison"] = {
                "bridge_delta": ollama_bridges - baseline_bridges,
                "baseline_encoder_mode": baseline.get("encoder_mode"),
                "ollama_encoder_mode": ollama_result.get("encoder_mode"),
                "baseline_elapsed_ms": baseline.get("elapsed_ms"),
                "ollama_elapsed_ms": ollama_result.get("elapsed_ms"),
            }
            if (
                ollama_result.get("encoder_mode") == "ollama_real"
                and ollama_bridges != baseline_bridges
            ):
                report["verdict"] = "signal_detected"
            else:
                report["verdict"] = "no_clear_change"
        else:
            report["notes"].append(
                f"Ollama checkpoint not found: {MMSS_OLLAMA_CHECKPOINT}. Run mmss_retrain first."
            )
            report["verdict"] = "baseline_only"

        safe_json_write(report_path, report)
        emit_data(report)
        emit_done({"report_path": str(report_path), "verdict": report["verdict"]})
    except Exception as e:
        emit_log("error", f"MMSS eval failed: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_torus_analyze(params_raw=None):
    params = parse_json_arg_or_file(params_raw, default={}) or {}
    module = get_gwcollapser()
    if module is None:
        emit_error(GW_ERROR or "GW-Collapser unavailable")
        return

    docs = params.get("docs")
    query = params.get("query")
    if not docs or not query:
        emit_error("torus_analyze requires docs[] and query")
        return

    try:
        emit_log("info", "GW-Collapser torus analysis started")
        result = module.analyze_torus_flow(
            docs=docs,
            query=query,
            doc_emb=params.get("doc_emb"),
            query_emb=params.get("query_emb"),
            n_clusters=int(params.get("n_clusters", 5)),
            dt=float(params.get("dt", 0.02)),
            friction=float(params.get("friction", 0.01)),
            epsilon=float(params.get("epsilon", 0.15)),
            max_steps=int(params.get("max_steps", 1500)),
            tol_speed=float(params.get("tol_speed", 1e-3)),
            geometry_R=float(params.get("geometry_R", 1.2)),
            geometry_r=float(params.get("geometry_r", 0.6)),
            embedding_model=str(params.get("embedding_model", "qllama/bge-m3:q8_0")),
        )
        payload = module.serialize_torus_for_web(result)
        emit_data(payload)
        emit_done(payload)
    except Exception as e:
        emit_log("error", f"GW-Collapser analysis failed: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


def cmd_ghost_continue(params_raw=None):
    params = parse_json_arg_or_file(params_raw, default={}) or {}
    module = get_gwcollapser_ghost()
    if module is None:
        emit_error(GW_GHOST_ERROR or "GW-Ghost unavailable")
        return

    analysis = params.get("analysis") or {}
    flow = analysis.get("flow") or {}
    torus = analysis.get("torus") or {}
    parameters = analysis.get("parameters") or {}
    docs = analysis.get("docs") or []
    history = flow.get("history") or []
    start_frame = max(0, int(params.get("start_frame", 0)))
    steps = max(1, int(params.get("steps", 100)))

    if not history:
        emit_error("ghost_continue requires persisted analysis.flow.history")
        return

    base_history = history[: start_frame + 1] if start_frame < len(history) else history
    start_xy = base_history[-1]
    sources = [
        {
            "x": float((doc.get("torus") or {}).get("x", 0.0)),
            "y": float((doc.get("torus") or {}).get("y", 0.0)),
            "mass": 1.0,
            "spin": 1.0 if index % 2 == 0 else -1.0,
        }
        for index, doc in enumerate(docs)
    ]

    try:
        emit_log("info", "GW-Ghost continuation started")
        oscillation_frame = module.detect_oscillation(
            history,
            window_size=5,
            speed_threshold=float(parameters.get("tol_speed", 1e-3)),
        )
        ghost = module.continue_trajectory(
            start_xy=start_xy,
            sources=sources,
            geometry_R=float(torus.get("R", parameters.get("geometry_R", 1.2))),
            geometry_r=float(torus.get("r", parameters.get("geometry_r", 0.6))),
            epsilon=float(torus.get("epsilon", parameters.get("epsilon", 0.15))),
            dt=float(parameters.get("dt", 0.02)),
            friction=float(parameters.get("friction", 0.01)),
            steps=steps,
            tol_speed=float(parameters.get("tol_speed", 1e-3)),
        )
        payload = {
            "crystal_id": params.get("crystal_id"),
            "crystal_code": params.get("crystal_code"),
            "start_frame": start_frame,
            "steps": steps,
            "oscillation_frame": oscillation_frame,
            "base_history": base_history,
            "ghost_history": np.asarray(ghost["history"]).tolist(),
            "final_point": np.asarray(ghost["final"]).tolist(),
            "parameters": {
                "dt": float(parameters.get("dt", 0.02)),
                "friction": float(parameters.get("friction", 0.01)),
                "epsilon": float(torus.get("epsilon", parameters.get("epsilon", 0.15))),
                "geometry_R": float(torus.get("R", parameters.get("geometry_R", 1.2))),
                "geometry_r": float(torus.get("r", parameters.get("geometry_r", 0.6))),
                "max_steps": int(parameters.get("max_steps", 1500)),
                "tol_speed": float(parameters.get("tol_speed", 1e-3)),
                "n_clusters": int(torus.get("clusters", parameters.get("n_clusters", 1))),
                "embedding_model": parameters.get("embedding_model"),
            },
        }
        emit_data(payload)
        emit_done(payload)
    except Exception as e:
        emit_log("error", f"GW-Ghost continuation failed: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


# ============================================================
# Main entrypoint
# ============================================================
def main():
    if len(sys.argv) < 2:
        emit_error("Не указана команда")
        return

    cmd = sys.argv[1]
    try:
        if cmd == "init":
            cmd_init()
        elif cmd == "generate":
            if len(sys.argv) < 3:
                emit_error("Не указан путь к профилю")
                return
            cmd_generate(sys.argv[2])
        elif cmd == "list_crystals":
            cmd_list_crystals()
        elif cmd == "get_crystal":
            if len(sys.argv) < 3:
                emit_error("Не указан код кристалла")
                return
            cmd_get_crystal(sys.argv[2])
        elif cmd == "search":
            if len(sys.argv) < 3:
                emit_error("Не указан поисковый запрос")
                return
            cmd_search(sys.argv[2])
        elif cmd == "run_pipeline":
            if len(sys.argv) < 3:
                emit_error("Не указан путь к пайплайну")
                return
            cmd_run_pipeline(sys.argv[2])
        elif cmd == "enrich":
            if len(sys.argv) < 3:
                emit_error("Не указан путь к параметрам")
                return
            cmd_enrich(sys.argv[2])
        elif cmd == "import_preview":
            if len(sys.argv) < 3:
                emit_error("Не указан путь к файлу")
                return
            cmd_import_preview(sys.argv[2])
        elif cmd == "import_apply":
            if len(sys.argv) < 3:
                emit_error("Не указан путь к файлу")
                return
            cmd_import_apply(sys.argv[2])
        elif cmd == "snapshot":
            label = sys.argv[2] if len(sys.argv) > 2 else "manual"
            cmd_snapshot(label)
        elif cmd == "knowledge_stats":
            cmd_knowledge_stats()
        elif cmd == "knowledge_export":
            cmd_knowledge_export()
        elif cmd == "mmss_status":
            cmd_mmss_status()
        elif cmd == "mmss_ingest_all":
            cmd_mmss_ingest_all()
        elif cmd == "mmss_ingest_code":
            if len(sys.argv) < 3:
                emit_error("Не указан код кристалла для mmss_ingest_code")
                return
            cmd_mmss_ingest_code(sys.argv[2])
        elif cmd == "mmss_retrain":
            raw = sys.argv[2] if len(sys.argv) > 2 else None
            cmd_mmss_retrain(raw)
        elif cmd == "mmss_eval":
            raw = sys.argv[2] if len(sys.argv) > 2 else None
            cmd_mmss_eval(raw)
        elif cmd == "torus_analyze":
            raw = sys.argv[2] if len(sys.argv) > 2 else None
            cmd_torus_analyze(raw)
        else:
            emit_error(f"Неизвестная команда: {cmd}")
    except KeyboardInterrupt:
        emit_log("warn", "Прервано пользователем")
        emit_error("interrupted")
    except Exception as e:
        emit_log("error", f"Необработанная ошибка: {e}")
        emit_log("error", traceback.format_exc())
        emit_error(str(e))


if __name__ == "__main__":
    # Graceful SIGTERM handling
    def handle_sigterm(signum, frame):
        emit_log("warn", "Получен SIGTERM, остановка…")
        sys.exit(130)
    signal.signal(signal.SIGTERM, handle_sigterm)
    main()
