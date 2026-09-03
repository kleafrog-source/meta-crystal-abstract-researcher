#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_anchors.py — Этап F: сборка anchors_build.json.

Запускается ЛОКАЛЬНО пользователем с уже поднятым Ollama:
    python build_anchors.py --endpoint http://localhost:11434 \
        --model qllama/bge-m3:q8_0 \
        [--dataset unified_parameters_enriched.json] \
        [--axes axes.json] \
        [--strong calibration/strong_set.json] \
        [--neutral calibration/neutral_set.json] \
        [--out anchors_build.json] \
        [--stub]

Эмбеддинги: Ollama `/api/embed` (поле `embeddings`), fallback `/api/embeddings`
(поле `embedding`).  Пакетизация запросов, retry, детерминизм (повторный
прогон 20 текстов → косинус ≥ 0.999).

Шаги (см. раздел 8 задания):
  1. Эмбеддить все парафразы якорей; якорь = центроид 4 парафраз.
  2. u_a, c_a; диагностика cos(ē_0.1, ē_0.9) ≤ 0.80.
  3. ē_id(p) для всех параметров (алиасы — от канонического).
  4. Калибровка κ_a на strong_set; проверка на neutral_set |κ_a·rawΔ| ≤ 0.05.
  5. a_home_a(p); диагностика home-консистентности внутри vibe_id.
  6. Матрица ортогональности 15×15 cos(u_a, u_b); пары > 0.80.
  7. Записать anchors_build.json: stub=false, model, endpoint, dim, sha.
  8. --stub: заглушки со значениями null/1.0/0.5, stub=true, PENDING —
     рантайм работает в lexical-only режиме (L2 пропускается).

Зависимости: Python 3.10+, стандартная библиотека + `requests` (опционально,
fallback на urllib). Никаких других внешних сервисов кроме Ollama.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from typing import Any, Iterable


def _configure_stdio() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream is None:
            continue
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


_configure_stdio()

# ---------------------------------------------------------------------------
# HTTP-клиент: requests если доступен, иначе urllib из stdlib.
# ---------------------------------------------------------------------------
try:
    import requests  # type: ignore
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False


# ---------------------------------------------------------------------------
# Vector math (numpy-free, 1024-dim — тривиально).
# ---------------------------------------------------------------------------
def _vec_add(a: list[float], b: list[float]) -> list[float]:
    return [x + y for x, y in zip(a, b)]


def _vec_scale(a: list[float], s: float) -> list[float]:
    return [x * s for x in a]


def _vec_sub(a: list[float], b: list[float]) -> list[float]:
    return [x - y for x, y in zip(a, b)]


def _vec_dot(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def _vec_norm(a: list[float]) -> float:
    return math.sqrt(sum(x * x for x in a))


def _vec_normalize(a: list[float]) -> list[float]:
    n = _vec_norm(a)
    if n == 0:
        return [0.0] * len(a)
    return [x / n for x in a]


def cosine(a: list[float], b: list[float]) -> float:
    na = _vec_norm(a)
    nb = _vec_norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return _vec_dot(a, b) / (na * nb)


def centroid(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return []
    acc = [0.0] * len(vectors[0])
    for v in vectors:
        acc = _vec_add(acc, v)
    return _vec_scale(acc, 1.0 / len(vectors))


# ---------------------------------------------------------------------------
# Ollama-клиент с retry и пакетизацией.
# ---------------------------------------------------------------------------
class OllamaClient:
    def __init__(self, endpoint: str, model: str, timeout: float = 60.0,
                 retries: int = 3, backoff: float = 1.5):
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.timeout = timeout
        self.retries = retries
        self.backoff = backoff
        # определить доступные эндпоинты
        self._embed_url = f"{self.endpoint}/api/embed"
        self._embeddings_url = f"{self.endpoint}/api/embeddings"
        self._dim: int | None = None

    def _post_json(self, url: str, payload: dict) -> dict:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url, data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        last_err: Exception | None = None
        for attempt in range(self.retries):
            try:
                if _HAS_REQUESTS:
                    r = requests.post(url, json=payload, timeout=self.timeout)
                    r.raise_for_status()
                    return r.json()
                else:
                    with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                        return json.loads(resp.read().decode("utf-8"))
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(self.backoff ** attempt)
        raise RuntimeError(f"Ollama POST {url} failed after {self.retries} retries: {last_err}")

    def embed(self, text: str) -> list[float]:
        # сначала /api/embed (новый эндпоинт Ollama), fallback на /api/embeddings
        try:
            payload = {"model": self.model, "input": text}
            r = self._post_json(self._embed_url, payload)
            # /api/embed возвращает {"embeddings": [[...]]} для инпута
            if "embeddings" in r and isinstance(r["embeddings"], list) and len(r["embeddings"]) > 0:
                vec = r["embeddings"][0]
                if isinstance(vec, list) and len(vec) > 0:
                    self._dim = len(vec)
                    return [float(x) for x in vec]
        except Exception:
            pass
        payload = {"model": self.model, "input": text}
        r = self._post_json(self._embeddings_url, payload)
        vec = r.get("embedding")
        if not isinstance(vec, list) or len(vec) == 0:
            raise RuntimeError(f"Ollama returned empty embedding for: {text[:80]!r}")
        self._dim = len(vec)
        return [float(x) for x in vec]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        # batched embed (если /api/embed поддерживает массив input)
        try:
            payload = {"model": self.model, "input": texts}
            r = self._post_json(self._embed_url, payload)
            embs = r.get("embeddings")
            if isinstance(embs, list) and len(embs) == len(texts):
                self._dim = len(embs[0]) if embs else None
                return [[float(x) for x in v] for v in embs]
        except Exception:
            pass
        # fallback по одному
        return [self.embed(t) for t in texts]

    @property
    def dim(self) -> int | None:
        return self._dim


# ---------------------------------------------------------------------------
# Загрузка артефактов
# ---------------------------------------------------------------------------
def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_json(obj: Any) -> str:
    raw = json.dumps(obj, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def emit_progress(stage: str, current: int, total: int, label: str) -> None:
    print(
        f"[progress] stage={stage} current={max(0, current)} total={max(1, total)} label={label}",
        flush=True,
    )


def iter_real_axes(axes_vectors: dict[str, dict]) -> Iterable[tuple[str, dict]]:
    for axis_id, vec in axes_vectors.items():
        if not isinstance(vec, dict):
            continue
        if "u" not in vec or "c" not in vec:
            continue
        yield axis_id, vec


# ---------------------------------------------------------------------------
# Основной пайплайн
# ---------------------------------------------------------------------------
def build_axes_vectors(axes: list[dict], client: OllamaClient | None,
                       progress_cb: Any | None = None
                       ) -> tuple[dict, dict, list[str]]:
    """Эмбеддинг якорей + u_a, c_a, диагностика. Возвращает:
       (axes_vectors, diagnostics_list, invalid_axes)
    """
    axes_vectors: dict[str, dict] = {}
    invalid_axes: list[str] = []
    diagnostics: list[str] = []
    total_axes = len(axes)
    for index, ax in enumerate(axes, start=1):
        aid = ax["id"]
        anchor_vecs: dict[float, list[float]] = {}
        # эмбеддим все парафразы, центроид = якорь
        all_texts = [p["text"] for a in ax["anchors"] for p in a["paraphrases"]]
        if client is None:
            # stub
            for a in ax["anchors"]:
                anchor_vecs[a["target_value"]] = []
            axes_vectors[aid] = {
                "u": None, "c": None, "kappa": 1.0,
                "anchors": {str(a["target_value"]): None for a in ax["anchors"]},
            }
            continue
        vecs = client.embed_batch(all_texts)
        idx = 0
        for a in ax["anchors"]:
            pv = vecs[idx:idx + 4]
            idx += 4
            anchor_vecs[a["target_value"]] = centroid(pv)
        # u_a = normalize(ē_0.9 − ē_0.1), c_a = 0.5(ē_0.9 + ē_0.1)
        e09 = anchor_vecs[0.9]
        e01 = anchor_vecs[0.1]
        u = _vec_normalize(_vec_sub(e09, e01))
        c = _vec_scale(_vec_add(e09, e01), 0.5)
        # диагностика
        cos_low_high = cosine(e01, e09)
        if cos_low_high > 0.80:
            invalid_axes.append(aid)
            diagnostics.append(
                f"axis {aid}: cos(ē_0.1, ē_0.9) = {cos_low_high:.4f} > 0.80 — INVALID"
            )
        axes_vectors[aid] = {
            "u": u, "c": c, "kappa": 1.0,  # будет откалиброван позже
            "anchors": {str(t): v for t, v in anchor_vecs.items()},
        }
        if progress_cb is not None:
            progress_cb("axes", index, total_axes, aid)
    return axes_vectors, {"invalid_axes": invalid_axes,
                          "axis_warnings": diagnostics}, invalid_axes


def build_param_embeddings(dataset: list[dict], client: OllamaClient | None,
                           progress_cb: Any | None = None
                           ) -> dict[str, list[float]]:
    """ē_id(p) — центроид эмбеддингов semantic_keywords параметра. Алиасы
    шарят эмбеддинг с каноническим."""
    out: dict[str, list[float]] = {}
    canonical_index: dict[str, str] = {}
    total_params = len(dataset)
    for index, p in enumerate(dataset, start=1):
        dedupe = p.get("dedupe") or {}
        if dedupe.get("alias") and dedupe.get("canonical"):
            canonical_index[p["technical_name"]] = dedupe["canonical"]
    for index, p in enumerate(dataset, start=1):
        name = p["technical_name"]
        if name in canonical_index:
            continue  # будет заполнено от канонического
        if client is None:
            out[name] = []
            continue
        kws = p.get("semantic_keywords") or []
        if not kws:
            out[name] = []
            continue
        # центроид по 7-15 ключевым словам — пакетно
        vecs = client.embed_batch(kws)
        out[name] = centroid(vecs)
    # алиасы → ссылка на канонический
    for alias, canon in canonical_index.items():
        out[alias] = out.get(canon, [])
    return out


def build_axes_vectors_with_progress(axes: list[dict], client: OllamaClient | None
                                     ) -> tuple[dict, dict, list[str]]:
    axes_vectors, diagnostics, invalid_axes = build_axes_vectors(axes, client)
    total_axes = len(axes)
    for index, ax in enumerate(axes, start=1):
        emit_progress("axes", index, total_axes, str(ax.get("id", index)))
    return axes_vectors, diagnostics, invalid_axes


def build_param_embeddings_with_progress(dataset: list[dict], client: OllamaClient | None
                                         ) -> dict[str, list[float]]:
    out: dict[str, list[float]] = {}
    canonical_index: dict[str, str] = {}
    for p in dataset:
        dedupe = p.get("dedupe") or {}
        if dedupe.get("alias") and dedupe.get("canonical"):
            canonical_index[p["technical_name"]] = dedupe["canonical"]

    total_params = len(dataset)
    for index, p in enumerate(dataset, start=1):
        name = p["technical_name"]
        if name in canonical_index:
            if index % 25 == 0 or index == total_params:
                emit_progress("param_embeddings", index, total_params, name)
            continue
        if client is None:
            out[name] = []
            if index % 25 == 0 or index == total_params:
                emit_progress("param_embeddings", index, total_params, name)
            continue
        kws = p.get("semantic_keywords") or []
        if not kws:
            out[name] = []
            if index % 25 == 0 or index == total_params:
                emit_progress("param_embeddings", index, total_params, name)
            continue
        vecs = client.embed_batch(kws)
        out[name] = centroid(vecs)
        if index % 25 == 0 or index == total_params:
            emit_progress("param_embeddings", index, total_params, name)

    for alias, canon in canonical_index.items():
        out[alias] = out.get(canon, [])
    return out


def calibrate_kappa(axes_vectors: dict[str, dict], strong_set: dict,
                    client: OllamaClient | None,
                    polarity_matrix: dict, dataset: list[dict]
                    ) -> tuple[dict, dict]:
    """κ_a = clamp(0.4/median_rawΔ, 0.5, 5.0) на strong_set.
    rawΔ = dot(E(x) − ē_id(p), u_a) для параметра, попадающего в kind с
    polarity_matrix[axis][kind] != 0. Возвращает (kappa_per_axis, diagnostics)."""
    # строим lookup: kind → list[tech_name]
    by_kind: dict[str, list[str]] = {}
    for p in dataset:
        k = p.get("quantity_kind")
        if k:
            by_kind.setdefault(k, []).append(p["technical_name"])
    # для каждого strong-запроса считаем rawΔ по его оси
    raw_per_axis: dict[str, list[float]] = {
        axis_id: [] for axis_id, _vec in iter_real_axes(axes_vectors)
    }
    for item in strong_set["items"]:
        axis = item.get("axis")
        if not axis:
            continue  # kind-пробы пропускаем на этом шаге
        # один репрезентативный параметр: первый параметр с kind, имеющим polarity != 0
        # по оси (берём первый подходящий)
        target_param = None
        for k, names in by_kind.items():
            pol = polarity_matrix.get(axis, {}).get(k, 0)
            if pol != 0 and names:
                target_param = names[0]
                break
        if target_param is None:
            continue
        e_id = axes_vectors.get("_param_embeddings_cache", {}).get(target_param, [])
        # чтобы не дублировать эмбеддинги, используем prebuilt
        # (упрощённо: в реальном коде ниже используется единый кэш)
        # rawΔ нужен только если есть client
        if client is None:
            continue
        # query embedding
        ex = client.embed(item["query"])
        u = axes_vectors[axis]["u"]
        c = axes_vectors[axis]["c"]
        if not e_id or not u:
            continue
        delta = _vec_dot(_vec_sub(ex, e_id), u)
        raw_per_axis[axis].append(abs(delta))
    kappa: dict[str, float] = {}
    diag: dict[str, Any] = {}
    for axis, vals in raw_per_axis.items():
        if not vals:
            kappa[axis] = 1.0
            diag[axis] = {"n": 0, "median_raw_delta": None, "kappa": 1.0,
                          "note": "no strong samples for this axis; defaulting κ=1.0"}
            continue
        vals_sorted = sorted(vals)
        median = vals_sorted[len(vals_sorted) // 2]
        if median <= 0:
            kappa[axis] = 1.0
        else:
            kappa[axis] = max(0.5, min(5.0, 0.4 / median))
        diag[axis] = {"n": len(vals), "median_raw_delta": median,
                      "kappa": kappa[axis]}
        axes_vectors[axis]["kappa"] = kappa[axis]
    return kappa, diag


def check_neutral(axes_vectors: dict[str, dict], neutral_set: dict,
                   client: OllamaClient | None, polarity_matrix: dict,
                   dataset: list[dict], param_embeddings: dict[str, list[float]],
                   epsilon_axis: float = 0.05) -> dict:
    """Проверка: на neutral_set |κ_a·rawΔ| ≤ 0.05. Если нарушено — ужать κ."""
    if client is None:
        return {"checked": False, "note": "stub mode; neutral check skipped"}
    by_kind: dict[str, list[str]] = {}
    for p in dataset:
        k = p.get("quantity_kind")
        if k:
            by_kind.setdefault(k, []).append(p["technical_name"])
    violations: list[dict] = []
    for item in neutral_set["items"]:
        ex = client.embed(item["query"])
        for axis, vec in iter_real_axes(axes_vectors):
            u = vec["u"]
            if not u:
                continue
            # один репрезентативный параметр на ось
            target_param = None
            for k, names in by_kind.items():
                pol = polarity_matrix.get(axis, {}).get(k, 0)
                if pol != 0 and names:
                    target_param = names[0]
                    break
            if not target_param:
                continue
            e_id = param_embeddings.get(target_param, [])
            if not e_id:
                continue
            delta = _vec_dot(_vec_sub(ex, e_id), u)
            scaled = abs(vec["kappa"] * delta)
            if scaled > epsilon_axis:
                violations.append({
                    "query": item["query"][:80],
                    "axis": axis,
                    "scaled_delta": round(scaled, 4),
                    "kappa": vec["kappa"],
                })
                # ужать κ: умножаем на 0.5 (детерминированная корректировка)
                axes_vectors[axis]["kappa"] = max(0.5, vec["kappa"] * 0.5)
    return {"checked": True, "violations": len(violations),
            "sample_violations": violations[:10]}


def build_a_home(axes_vectors: dict[str, dict], dataset: list[dict],
                 param_embeddings: dict[str, list[float]]) -> tuple[dict, dict]:
    """a_home_a(p) = 0.5 + κ_a·dot(ē_id(p) − c_a, u_a). Диагностика
    home-консистентности: std(a_home) внутри vibe_id ≤ 0.12."""
    a_home: dict[str, dict[str, float]] = {}
    for p in dataset:
        name = p["technical_name"]
        e_id = param_embeddings.get(name, [])
        if not e_id:
            continue
        per_axis: dict[str, float] = {}
        for axis_id, vec in iter_real_axes(axes_vectors):
            u = vec["u"]
            c = vec["c"]
            kappa = vec["kappa"]
            if not u or not c:
                continue
            delta = _vec_dot(_vec_sub(e_id, c), u)
            per_axis[axis_id] = round(0.5 + kappa * delta, 6)
        a_home[name] = per_axis
    # диагностика по vibe_id
    vibe_groups: dict[str, list[str]] = {}
    for p in dataset:
        vid = p.get("vibe_id")
        if vid:
            vibe_groups.setdefault(vid, []).append(p["technical_name"])
    home_violations: list[dict] = []
    for vid, names in vibe_groups.items():
        if len(names) < 2:
            continue
        for axis_id, _vec in iter_real_axes(axes_vectors):
            vals = [a_home.get(n, {}).get(axis_id) for n in names]
            vals = [v for v in vals if v is not None]
            if len(vals) < 2:
                continue
            mean = sum(vals) / len(vals)
            var = sum((v - mean) ** 2 for v in vals) / len(vals)
            std = math.sqrt(var)
            if std > 0.12:
                home_violations.append({
                    "vibe_id": vid, "axis": axis_id, "std": round(std, 4),
                    "members": names,
                })
    return a_home, {"home_violations": home_violations,
                    "vibe_groups_checked": len(vibe_groups)}


def build_orthogonality_matrix(axes_vectors: dict[str, dict]) -> dict:
    """15×15 cos(u_a, u_b); пары > 0.80 → correlated_axis_pairs."""
    ids = [axis_id for axis_id, _vec in iter_real_axes(axes_vectors)]
    matrix: dict[str, dict[str, float]] = {a: {} for a in ids}
    correlated: list[dict] = []
    for a in ids:
        for b in ids:
            ua = axes_vectors[a]["u"]
            ub = axes_vectors[b]["u"]
            if not ua or not ub:
                matrix[a][b] = 0.0
                continue
            cos = round(cosine(ua, ub), 4)
            matrix[a][b] = cos
            if a < b and abs(cos) > 0.80:
                correlated.append({"a": a, "b": b, "cos": cos})
    return {"matrix": matrix, "correlated_axis_pairs": correlated}


def check_determinism(client: OllamaClient, sample_texts: list[str],
                      threshold: float = 0.999) -> dict:
    """Повторный прогон 20 текстов → косинус ≥ 0.999."""
    if client is None:
        return {"checked": False, "note": "stub mode"}
    pairs: list[float] = []
    for t in sample_texts[:20]:
        v1 = client.embed(t)
        v2 = client.embed(t)
        pairs.append(cosine(v1, v2))
    min_cos = min(pairs) if pairs else 0.0
    return {"checked": True, "min_cosine_repeat": round(min_cos, 6),
            "samples": len(pairs),
            "deterministic": min_cos >= threshold}


# ---------------------------------------------------------------------------
# Stub-режим
# ---------------------------------------------------------------------------
def build_stub(axes: list[dict], dataset: list[dict],
               dataset_sha: str, axes_sha: str) -> dict:
    axes_vectors: dict[str, dict] = {}
    for ax in axes:
        aid = ax["id"]
        axes_vectors[aid] = {
            "u": None, "c": None, "kappa": 1.0,
            "anchors": {str(a["target_value"]): None for a in ax["anchors"]},
        }
    a_home: dict[str, dict] = {}
    for p in dataset:
        a_home[p["technical_name"]] = {ax["id"]: 0.5 for ax in axes}
    return {
        "stub": True,
        "model": None,
        "endpoint": None,
        "dim": None,
        "dataset_sha": dataset_sha,
        "axes_sha": axes_sha,
        "generated_at": _now_iso(),
        "axes": axes_vectors,
        "a_home": a_home,
        "diagnostics": {
            "status": "PENDING",
            "invalid_axes": [],
            "axis_warnings": [],
            "kappa_calibration": {},
            "neutral_check": {"checked": False},
            "home_violations": [],
            "orthogonality": {"matrix": {}, "correlated_axis_pairs": []},
            "determinism": {"checked": False},
        },
    }


def _now_iso() -> str:
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default="http://localhost:11434")
    ap.add_argument("--model", default="qllama/bge-m3:q8_0")
    ap.add_argument("--dataset", default="unified_parameters_enriched.json")
    ap.add_argument("--axes", default="axes.json")
    ap.add_argument("--polarity", default="polarity_matrix.json")
    ap.add_argument("--strong", default="calibration/strong_set.json")
    ap.add_argument("--neutral", default="calibration/neutral_set.json")
    ap.add_argument("--out", default="anchors_build.json")
    ap.add_argument("--stub", action="store_true",
                    help="Сгенерировать заглушку (без Ollama): lexical-only режим.")
    ap.add_argument("--timeout", type=float, default=60.0)
    args = ap.parse_args(argv)

    print(f"[build_anchors] stub={args.stub} model={args.model} endpoint={args.endpoint}")
    dataset = load_json(args.dataset)
    axes_doc = load_json(args.axes)
    axes = axes_doc["axes"]
    polarity = load_json(args.polarity)
    strong = load_json(args.strong)
    neutral = load_json(args.neutral)

    dataset_sha = sha256_json(dataset)
    axes_sha = sha256_json(axes_doc)

    if args.stub:
        payload = build_stub(axes, dataset, dataset_sha, axes_sha)
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"[build_anchors] STUB written → {args.out}")
        print(f"  axes: {len(axes)} | a_home params: {len(payload['a_home'])}")
        print(f"  diagnostics.status: PENDING — рантайм будет в lexical-only режиме.")
        return 0

    # Реальный прогон с Ollama
    print(f"[build_anchors] probing Ollama at {args.endpoint} …")
    client = OllamaClient(args.endpoint, args.model, timeout=args.timeout)
    try:
        probe = client.embed("ping")
        print(f"  OK, dim={len(probe)}")
    except Exception as e:
        print(f"  FAIL: {e}", file=sys.stderr)
        print("  Hint: запустите `ollama serve` и `ollama pull bge-m3`", file=sys.stderr)
        return 2

    # 1. Эмбеддинг якорей + u_a, c_a
    print("[build_anchors] embedding 75 anchors × 4 paraphrases …")
    emit_progress("phase", 1, 7, "embed_axes")
    axes_vectors, axis_diag, _invalid = build_axes_vectors(axes, client, emit_progress)
    print(f"  done. invalid_axes: {axis_diag['invalid_axes']}")

    # 2. Эмбеддинг параметров
    print(f"[build_anchors] embedding {len(dataset)} parameters' semantic_keywords …")
    emit_progress("phase", 2, 7, "param_embeddings")
    param_embeddings = build_param_embeddings_with_progress(dataset, client)
    axes_vectors["_param_embeddings_cache"] = param_embeddings  # internal
    print(f"  done. embeddings: {sum(1 for v in param_embeddings.values() if v)}")

    # 3. Калибровка κ
    print("[build_anchors] calibrating κ on strong_set …")
    emit_progress("phase", 3, 7, "calibrate_kappa")
    kappa, kappa_diag = calibrate_kappa(axes_vectors, strong, client,
                                        polarity, dataset)
    for axis, info in kappa_diag.items():
        print(f"  {axis}: κ={info['kappa']:.3f} (n={info['n']}, median={info['median_raw_delta']})")

    # 4. Проверка neutral
    print("[build_anchors] checking neutral_set |κ·rawΔ| ≤ 0.05 …")
    emit_progress("phase", 4, 7, "neutral_check")
    neutral_check = check_neutral(axes_vectors, neutral, client,
                                  polarity, dataset, param_embeddings)
    print(f"  violations: {neutral_check.get('violations', 'n/a')}")

    # 5. a_home
    print("[build_anchors] computing a_home for all parameters …")
    emit_progress("phase", 5, 7, "a_home")
    a_home, home_diag = build_a_home(axes_vectors, dataset, param_embeddings)
    print(f"  home violations: {len(home_diag['home_violations'])}")

    # 6. Ортогональность
    print("[build_anchors] building 15×15 orthogonality matrix …")
    emit_progress("phase", 6, 7, "orthogonality")
    orth = build_orthogonality_matrix(axes_vectors)
    print(f"  correlated pairs (>0.80): {len(orth['correlated_axis_pairs'])}")

    # 7. Детерминизм
    print("[build_anchors] determinism check (20 repeated embeds) …")
    sample_texts = [p["text"] for ax in axes[:5] for a in ax["anchors"]
                    for p in a["paraphrases"]]
    emit_progress("phase", 7, 7, "determinism")
    det = check_determinism(client, sample_texts)
    print(f"  min cosine repeat: {det.get('min_cosine_repeat')} → deterministic={det.get('deterministic')}")

    # убираем internal cache перед записью
    axes_vectors.pop("_param_embeddings_cache", None)

    payload = {
        "stub": False,
        "model": args.model,
        "endpoint": args.endpoint,
        "dim": client.dim,
        "dataset_sha": dataset_sha,
        "axes_sha": axes_sha,
        "generated_at": _now_iso(),
        "axes": axes_vectors,
        "a_home": a_home,
        "diagnostics": {
            "status": "OK",
            "invalid_axes": axis_diag["invalid_axes"],
            "axis_warnings": axis_diag["axis_warnings"],
            "kappa_calibration": kappa_diag,
            "neutral_check": neutral_check,
            "home_violations": home_diag["home_violations"],
            "vibe_groups_checked": home_diag["vibe_groups_checked"],
            "orthogonality": orth,
            "determinism": det,
        },
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"[build_anchors] REAL anchors written → {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
