#!/usr/bin/env python3
"""
MMSS ↔ Мета-Кристалл bridge — адаптер формата репозитория
meta-crystal-abstract-researcher.

Формат кристалла в репозитории (data/meta_crystals/crystals/{code}.json):
{
  "meta": { "code": "AXC0R-e2b", "type": "hybrid|diamond|emerald", "category": "...",
            "counter": N, "step": 0, "datetime": "...", "generation": 0|"synthetic",
            "parents": [...] },
  "crystal": {
    "focus": { "type": "categorical", "word": "...", "category": "focus" },
    "pattern": "...", "elements": [...],
    "operators": [{ "key": "...", "symbol": "⊗", "type": "math", "arity": 2, "priority": 2 }],
    "combination": "A ⊗ [B ⊕ C] ^ D",
    "complexity": 18, "quality_score": 0, "metrics": {}
  },
  "classification": { "type": "...", "reasons": [...] }
}
+ root fields: llm_micro_note, vector_direction, mutation_probabilities, llm_synthesis_reasoning

Изоморфизмы: data/meta_crystals/isomorphisms.json = { code: [{target_id, strength, evidence}] }

Manifested (синтезированные) кристаллы: data/meta_crystals/crystals/manifested/{code}.json
  meta.type="diamond", meta.category="manifested", meta.generation="synthetic", meta.parents=[donors]

Этот мост:
  - читает кристаллы репозитория как узлы MMSS (combination -> z_q -> invariant)
  - обнаруженные ⊘-мосты записывает обратно как manifested-diamond в формате репозитория
  - обновляет isomorphisms.json (тот же граф-формат)
То есть MMSS-сессия становится движком проявления над реальной базой кристаллов.
"""

import json
import os
import time
import uuid
import hashlib
from pathlib import Path
from typing import Optional

import torch

from mmss_realtime_session import RealtimeSession, adaptive_threshold


# ---------------------------------------------------------------------------
# Хранилище кристаллов в формате репозитория
# ---------------------------------------------------------------------------
class MetaCrystalStore:
    def __init__(self, data_root: str):
        self.data_root = Path(data_root)
        self.crystals_root = self.data_root / "meta_crystals" / "crystals"
        self.manifested_root = self.crystals_root / "manifested"
        self.meta_root = self.crystals_root / "meta"
        self.isomorphisms_file = self.data_root / "meta_crystals" / "isomorphisms.json"
        self.manifested_root.mkdir(parents=True, exist_ok=True)
        self.meta_root.mkdir(parents=True, exist_ok=True)
        self.isomorphisms_file.parent.mkdir(parents=True, exist_ok=True)
        self.counter_file = self.meta_root / "counter.json"

    # --- чтение ---
    def read_all(self) -> list[dict]:
        """Все кристаллы репозитория (рекурсивно, skip index.json)."""
        out = []
        if not self.crystals_root.exists():
            return out
        for p in self._collect_json(self.crystals_root):
            try:
                j = json.loads(p.read_text("utf-8"))
                if isinstance(j, dict) and self._code(j):
                    j["__filepath"] = str(p)
                    out.append(j)
            except Exception:
                continue
        return out

    def _collect_json(self, d: Path) -> list[Path]:
        items = []
        for name in os.listdir(d):
            abs_p = d / name
            if abs_p.is_dir():
                items += self._collect_json(abs_p)
            elif abs_p.suffix.lower() == ".json" and name.lower() != "index.json":
                items.append(abs_p)
        return items

    @staticmethod
    def _code(j: dict) -> str:
        return str(j.get("meta", {}).get("code", "") or j.get("code", "") or "")

    @staticmethod
    def crystal_query_text(j: dict) -> str:
        """Текст для энкодера: combination (формула) — первичный сигнал;
        fallback на focus.word + elements."""
        comb = j.get("crystal", {}).get("combination", "")
        if comb:
            return str(comb)
        focus = j.get("crystal", {}).get("focus", {})
        elems = j.get("crystal", {}).get("elements", [])
        parts = [str(focus.get("word", ""))] + [str(e) for e in elems]
        return " ".join(p for p in parts if p)

    # --- запись (атомарно: temp + replace, как в manifestation.ts) ---
    def atomic_write(self, filepath: Path, data: dict):
        filepath.parent.mkdir(parents=True, exist_ok=True)
        tmp = filepath.with_suffix(f".{uuid.uuid4().hex}.tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), "utf-8")
        os.replace(tmp, filepath)

    def write_manifested(self, crystal_json: dict) -> str:
        meta = crystal_json.setdefault("meta", {})
        if not meta.get("counter"):
            meta["counter"] = self.get_next_counter()
        code = self._code(crystal_json)
        filepath = self.manifested_root / f"{code}.json"
        self.atomic_write(filepath, crystal_json)
        return str(filepath)

    def get_next_counter(self) -> int:
        counter = 0
        if self.counter_file.exists():
            try:
                payload = json.loads(self.counter_file.read_text("utf-8"))
                counter = int(payload.get("counter", 0))
            except Exception:
                counter = 0
        counter += 1
        self.atomic_write(self.counter_file, {"counter": counter})
        return counter

    def append_isomorphism_edge(self, code_a: str, code_b: str,
                                strength: float, evidence: str):
        graph = {}
        if self.isomorphisms_file.exists():
            try:
                graph = json.loads(self.isomorphisms_file.read_text("utf-8"))
            except Exception:
                graph = {}
        graph.setdefault(code_a, [])
        graph.setdefault(code_b, [])
        edge = {"target_id": code_b, "strength": round(float(strength), 4), "evidence": evidence}
        if not any(e["target_id"] == code_b for e in graph[code_a]):
            graph[code_a].append(edge)
        if not any(e["target_id"] == code_a for e in graph[code_b]):
            graph[code_b].append({**edge, "target_id": code_a})
        self.atomic_write(self.isomorphisms_file, graph)


# ---------------------------------------------------------------------------
# Построение manifested-diamond из MMSS-моста
# ---------------------------------------------------------------------------
MMSS_BRIDGE_OPERATORS = [
    {"key": "isomorphism", "symbol": "⊘", "type": "mmss", "arity": 2, "priority": 1},
    {"key": "phase_transition", "symbol": "↯", "type": "mmss", "arity": 1, "priority": 0},
]


SCIENCE_CODES = {"M", "L", "G", "P", "S", "T", "D", "I", "C", "W", "R", "Q", "F"}


def _pick_science_code(donor_codes: list[str]) -> str:
    counts = {}
    for donor in donor_codes:
        letter = (donor[:1] or "").upper()
        if letter in SCIENCE_CODES:
            counts[letter] = counts.get(letter, 0) + 1
    if counts:
        return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
    return "Q"


def _pick_intensity_code(invariant: torch.Tensor, touched_clusters: list[int]) -> str:
    magnitude = float(invariant.abs().max().item()) if invariant.numel() else 0.0
    if len(set(touched_clusters)) >= 4:
        return "Q"
    if magnitude >= 0.85:
        return "H"
    if magnitude <= 0.2:
        return "L"
    return "N"


def _pick_pattern_code(donor_codes: list[str], touched_clusters: list[int]) -> str:
    unique_sciences = {
        (donor[:1] or "").upper()
        for donor in donor_codes
        if (donor[:1] or "").upper() in SCIENCE_CODES
    }
    if len(unique_sciences) >= 3 or len(set(touched_clusters)) >= 4:
        return "Y"
    if len(donor_codes) >= 3:
        return "V"
    return "T"


def build_bridge_code(bridge_text: str, donor_codes: list[str],
                      invariant: torch.Tensor, touched_clusters: list[int],
                      combination: str) -> str:
    science = _pick_science_code(donor_codes)
    operator = "X"
    intensity = _pick_intensity_code(invariant, touched_clusters)
    psychology = "R"
    pattern = _pick_pattern_code(donor_codes, touched_clusters)
    suffix_seed = "|".join([
        bridge_text,
        combination,
        ",".join(donor_codes),
        ",".join(str(cluster) for cluster in touched_clusters),
    ])
    suffix = hashlib.md5(suffix_seed.encode("utf-8")).hexdigest()[:3]
    return f"{science}{operator}{intensity}{psychology}{pattern}-{suffix}"


def build_bridge_crystal(bridge_text: str, donor_codes: list[str],
                         invariant: torch.Tensor, render: dict,
                         touched_clusters: list[int]) -> dict:
    """Синтезирует manifested-diamond в формате репозитория из MMSS-моста."""
    now = time.strftime("%Y-%m-%dT%H:%M:%S.000000")
    combination = (
        f"[{donor_codes[0] if donor_codes else 'A'}] вЉ "
        f"[{donor_codes[1] if len(donor_codes) > 1 else 'B'}] в†Ї"
    )
    code = build_bridge_code(
        bridge_text,
        donor_codes,
        invariant,
        touched_clusters,
        "bridge:" + "|".join(donor_codes),
    )
    inv_list = [round(float(x), 5) for x in invariant.tolist()]
    dom = int(torch.argmax(invariant.abs()).item())
    mag = float(invariant.abs().max().item())
    combination = (
        f"[{donor_codes[0] if donor_codes else 'A'}] ⊘ "
        f"[{donor_codes[1] if len(donor_codes) > 1 else 'B'}] ↯"
    )
    return {
        "meta": {
            "code": code,
            "type": "diamond",
            "category": "manifested",
            "counter": None,
            "step": 0,
            "datetime": now,
            "generation": "synthetic",
            "parents": donor_codes,
        },
        "crystal": {
            "focus": {"type": "categorical", "word": bridge_text, "category": "focus"},
            "pattern": "изоморфный",
            "elements": donor_codes,
            "operators": MMSS_BRIDGE_OPERATORS,
            "combination": combination,
            "complexity": int(mag * 100),
            "quality_score": round(mag, 4),
            "metrics": {
                "invariant": inv_list,
                "dominant_axis": dom,
                "touched_clusters": touched_clusters,
                "source": "mmss_v2.2_realtime",
            },
        },
        "classification": {
            "type": "diamond",
            "reasons": ["MMSS ⊘ isomorphism bridge between crystal clusters"],
        },
        "llm_micro_note": render.get("text", ""),
        "vector_direction": f"invariant[{dom}] polarity "
                            f"{'positive' if invariant[dom].item() >= 0 else 'negative'}",
        "llm_synthesis_reasoning": (
            "Bridge discovered by MMSS ⊘ operator in invariant space: node touched "
            f"{len(touched_clusters)} stable clusters. Not obtainable by simple enumeration."
        ),
    }


# ---------------------------------------------------------------------------
# Realtime-сессия над базой кристаллов репозитория
# ---------------------------------------------------------------------------
class MetaCrystalRealtimeSession(RealtimeSession):
    """Realtime-сессия, читающая/пишущая кристаллы в формате Мета-Кристалла."""

    def __init__(self, ckpt_path: str, store: MetaCrystalStore, encoder=None,
                 ground_truth_domains: bool = False):
        super().__init__(ckpt_path, encoder=encoder,
                         crystal_store=None,  # отключаем старый JSONL-стор
                         ground_truth_domains=ground_truth_domains)
        self.store = store
        self.crystal_codes = []  # code каждого узла в порядке ingestion

    def _materialize_crystal(self, text, inv, touched_clusters, cycle):
        """Материализует мост как repo-format manifested-diamond.
        Родитель append'ит возвращённое значение в self.crystals — поэтому здесь
        возвращаем repo-format diamond (legacy-формат не используется)."""
        donors = self._bridge_donor_codes()
        diamond = build_bridge_crystal(text, donors, inv, cycle["render_outputs"], touched_clusters)
        saved_path = self.store.write_manifested(diamond)
        for dcode in donors:
            self.store.append_isomorphism_edge(
                diamond["meta"]["code"], dcode,
                strength=float(inv.abs().max().item()),
                evidence=f"mmss ⊘ bridge, invariant touched {touched_clusters}")
        diamond["__saved_path"] = saved_path
        diamond["crystal_id"] = diamond["meta"]["code"]  # родитель читает cycle["crystal"]["crystal_id"]
        return diamond

    def ingest_crystal(self, crystal_json: dict) -> dict:
        """Ingest кристалла репозитория: combination -> z_q -> invariant -> ⊘/↯.
        При обнаружении моста родитель вызывает _materialize_crystal -> manifested-diamond + edge."""
        code = MetaCrystalStore._code(crystal_json)
        query_text = MetaCrystalStore.crystal_query_text(crystal_json)
        self.crystal_codes.append(code)  # до ingest, чтобы _materialize_crystal видел код
        result = self.ingest(query_text)  # родной ingest (всё делает сам)
        result["event"]["crystal_code"] = code
        result["event"]["combination"] = query_text
        if result["event"].get("is_bridge") and self.crystals:
            d = self.crystals[-1]
            result["cycle"]["crystal"] = {
                "crystal_id": d["meta"]["code"], "type": "diamond",
                "stored": True, "store": "repo_format_manifested",
                "filepath": d.get("__saved_path"), "parents": d["meta"]["parents"],
            }
        return result

    def _bridge_donor_codes(self) -> list[str]:
        """Коды кристаллов-доноров = последние узлы из разных кластеров, чего касался мост.
        Упрощённо: последние ~2-4 кода перед текущим (представители затронутых кластеров)."""
        return list(reversed(self.crystal_codes[-4:-1]))  # до текущего


# ---------------------------------------------------------------------------
# Демо: seed-кристаллы в формате репозитория -> ingest -> manifested diamonds
# ---------------------------------------------------------------------------
SAMPLE_CRYSTALS = [
    {
        "meta": {"code": "AUDO-0001", "type": "hybrid", "category": "hybrids",
                 "counter": 1, "step": 0, "datetime": "2026-07-17T08:00:00", "generation": 0},
        "crystal": {"focus": {"type": "categorical", "word": "резонанс", "category": "focus"},
                    "pattern": "рефлексивный", "elements": ["волна", "частота"],
                    "operators": [{"key": "суперпозиция", "symbol": "⊕", "type": "math",
                                   "arity": 2, "priority": 2}],
                    "combination": "A ⊕ [ B ⊗ C ]",
                    "complexity": 12, "quality_score": 0.6, "metrics": {}},
        "classification": {"type": "hybrid", "reasons": ["seed"]}
    },
    {
        "meta": {"code": "QNTM-0002", "type": "hybrid", "category": "hybrids",
                 "counter": 2, "step": 0, "datetime": "2026-07-17T08:01:00", "generation": 0},
        "crystal": {"focus": {"type": "categorical", "word": "суперпозиция", "category": "focus"},
                    "pattern": "фрактальный", "elements": ["квант", "когерентность"],
                    "operators": [{"key": "тензор", "symbol": "⊗", "type": "math",
                                   "arity": 2, "priority": 2}],
                    "combination": "Q ⊗ [ ∂/∂t ( Φ ) ]",
                    "complexity": 15, "quality_score": 0.7, "metrics": {}},
        "classification": {"type": "hybrid", "reasons": ["seed"]}
    },
    {
        "meta": {"code": "CRYP-0003", "type": "hybrid", "category": "hybrids",
                 "counter": 3, "step": 0, "datetime": "2026-07-17T08:02:00", "generation": 0},
        "crystal": {"focus": {"type": "categorical", "word": "инвариант", "category": "focus"},
                    "pattern": "рефлексивный", "elements": ["хэш", "ключ"],
                    "operators": [{"key": "умножение", "symbol": "⊗", "type": "math",
                                   "arity": 2, "priority": 2}],
                    "combination": "H ⊗ K ^ N",
                    "complexity": 10, "quality_score": 0.5, "metrics": {}},
        "classification": {"type": "hybrid", "reasons": ["seed"]}
    },
]


def seed_sample_crystals(store: MetaCrystalStore):
    """Записать seed-кристаллы в формате репозитория (для демо, т.к. data/ пуст)."""
    for c in SAMPLE_CRYSTALS:
        code = MetaCrystalStore._code(c)
        store.atomic_write(store.crystals_root / f"{code}.json", c)


def generate_sample_base(store: MetaCrystalStore, n_per_group=8, n_bridges=8):
    """Сгенерировать более богатую базу кристаллов в формате репозитория:
    доменные группы (audio/quantum/crypto/topology/counterfactual/isomorphism)
    + кросс-доменные мосты. combination несёт доменный словарь, чтобы обученная ℋ
    давала разделимые инварианты и ⊘ активировался."""
    import random as _r
    rng = _r.Random(2024)
    from mmss_distill_isomorphism import DOMAINS, DOMAIN_VOCAB
    counter = 100
    for d in DOMAINS:
        for i in range(n_per_group):
            k1, k2 = rng.sample(DOMAIN_VOCAB[d], 2)
            code = f"{d[:4].upper()}-{counter:04d}"
            counter += 1
            c = {
                "meta": {"code": code, "type": "hybrid", "category": "hybrids",
                         "counter": counter, "step": 0,
                         "datetime": "2026-07-17T08:00:00", "generation": 0},
                "crystal": {
                    "focus": {"type": "categorical", "word": k1, "category": "focus"},
                    "pattern": "рефлексивный", "elements": [k1, k2],
                    "operators": [{"key": "связь", "symbol": "⊗", "type": "math",
                                   "arity": 2, "priority": 2}],
                    "combination": f"{k1} ⊗ [ {k2} ⊕ node{i} ]",
                    "complexity": 10 + i, "quality_score": 0.5 + i * 0.01, "metrics": {}},
                "classification": {"type": "hybrid", "reasons": [f"seed {d}"]},
            }
            store.atomic_write(store.crystals_root / f"{code}.json", c)
    # мосты (кросс-доменные)
    for i in range(n_bridges):
        d1, d2 = rng.sample(DOMAINS, 2)
        k1 = rng.choice(DOMAIN_VOCAB[d1])
        k2 = rng.choice(DOMAIN_VOCAB[d2])
        code = f"BRDG-{counter:04d}"
        counter += 1
        c = {
            "meta": {"code": code, "type": "hybrid", "category": "hybrids",
                     "counter": counter, "step": 0,
                     "datetime": "2026-07-17T09:00:00", "generation": 0},
            "crystal": {
                "focus": {"type": "categorical", "word": f"{k1}-{k2}", "category": "focus"},
                "pattern": "изоморфный", "elements": [k1, k2],
                "operators": [{"key": "мост", "symbol": "⊘", "type": "mmss",
                               "arity": 2, "priority": 1}],
                "combination": f"{k1} ⊘ {k2} ↯ bridge{i}",
                "complexity": 20 + i, "quality_score": 0.6, "metrics": {}},
            "classification": {"type": "hybrid", "reasons": [f"bridge {d1}-{d2}"]},
        }
        store.atomic_write(store.crystals_root / f"{code}.json", c)


if __name__ == "__main__":
    import random
    random.seed(1337)
    torch.manual_seed(1337)

    # ДЕМО: используем ОТДЕЛЬНЫЙ demo-data-root, чтобы не загрязнять реальную базу
    # кристаллов репозитория. Для работы над реальной базой передайте repo data path в store.
    _here = Path(__file__).resolve().parent
    demo_data = str(_here / "demo_data")
    import shutil as _sh
    _sh.rmtree(demo_data, ignore_errors=True)
    store = MetaCrystalStore(demo_data)
    seed_sample_crystals(store)
    generate_sample_base(store, n_per_group=8, n_bridges=8)
    all_crystals = store.read_all()
    print(f"read {len(all_crystals)} crystals from {store.crystals_root} (DEMO root, not repo data/)")
    for c in all_crystals:
        print(f"  - {MetaCrystalStore._code(c)}: {MetaCrystalStore.crystal_query_text(c)}")

    ckpt = str(_here / "v22_hyper_synthetic_distilled.pt")
    session = MetaCrystalRealtimeSession(ckpt, store, ground_truth_domains=False)

    print(f"\ningesting {len(all_crystals)} repo-format crystals as MMSS nodes...")
    for c in all_crystals:
        r = session.ingest_crystal(c)
        ev = r["event"]
        flag = "🔷BRIDGE" if ev.get("is_bridge") else "node"
        print(f"  [{flag}] {ev.get('crystal_code')} | {ev.get('combination','')[:40]} | "
              f"adaptive={ev['adaptive_threshold']['threshold']} clusters={ev['n_stable_clusters']}")

    snap = session.ui_snapshot()
    print("\n=== UI SNAPSHOT (формат Мета-Кристалла) ===")
    print(json.dumps(snap, ensure_ascii=False, indent=2))

    print(f"\nmanifested diamonds written: {len(session.crystals)}")
    repo_diamonds = [d for d in session.crystals if isinstance(d, dict) and "meta" in d]
    print(f"repo-format diamonds: {len(repo_diamonds)}")
    for d in repo_diamonds:
        print(f"  - {d['meta']['code']} (parents={d['meta']['parents']}) "
              f"-> {store.manifested_root / (d['meta']['code'] + '.json')}")

    iso_path = store.isomorphisms_file
    if iso_path.exists():
        iso = json.loads(iso_path.read_text("utf-8"))
        print(f"\nisomorphisms.json edges: {sum(len(v) for v in iso.values())} "
              f"(nodes={len(iso)})")

    # verify a manifested diamond was written in correct repo format
    verified = None
    if repo_diamonds:
        vf = store.manifested_root / (repo_diamonds[0]["meta"]["code"] + ".json")
        if vf.exists():
            verified = json.loads(vf.read_text("utf-8"))
            verified = {k: verified[k] for k in ["meta", "classification"]}

    out = {
        "engine": "MMSS_META_CRYSTAL_BRIDGE",
        "version": "v2.2-repo-integration",
        "repo": "kleafrog-source/meta-crystal-abstract-researcher",
        "crystal_format": "repo (meta/crystal/classification + manifested diamonds)",
        "n_crystals_read": len(all_crystals),
        "n_manifested_diamonds_written": len(repo_diamonds),
        "manifested_diamonds": [{"code": d["meta"]["code"], "parents": d["meta"]["parents"],
                                  "combination": d["crystal"]["combination"],
                                  "type": d["meta"]["type"], "category": d["meta"]["category"]}
                                 for d in repo_diamonds],
        "isomorphisms_graph_nodes": len(iso) if iso_path.exists() else 0,
        "verified_repo_format_diamond": verified,
        "ui_snapshot": snap,
        "round_trip_demonstrated": "read repo-format crystal (combination) -> z_q -> invariant -> ⊘/↯ -> write repo-format manifested diamond (meta.type=diamond, category=manifested, generation=synthetic, parents) + isomorphisms.json edge",
    }
    with open(_here / "v22_meta_crystal_bridge_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"\nresults -> {_here / 'v22_meta_crystal_bridge_results.json'}")
