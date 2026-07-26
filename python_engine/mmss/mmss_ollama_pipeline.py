#!/usr/bin/env python3
"""
MMSS Ollama-pipeline — связывает swap-энкодер/учитель с обучением ℋ и ⊘.

Поток:
  1) detect Ollama (auto)
  2) make_encoder / make_teacher → (callable, mode)  [ollama_real ИЛИ fallback]
  3) собрать ядро, encode() которого = swapped encoder  (ключевой swap)
  4) переобучить ℋ на (query → ideal invariant) парах, где invariant = swapped teacher
  5) быстрый тест ⊘
  6) отчёт: какой mode реально отработал + метрики

В сэндбоксе Ollama недоступен → pipeline честно отрабатывает в fallback mode
(encoder=feature_hash, teacher=synthetic). Локально у пользователя с поднятым
Ollama те же строчки переключатся на ollama_real без изменения логики.
"""

import json
import random
import time

import torch

from mmss_v22_core import MMSSCore, SEED
from mmss_ollama_swap import make_encoder, make_teacher, detect_ollama
from mmss_distill_isomorphism import gen_dataset, query_domains, DOMAINS


def build_swappable_core(encoder, emb_dim=64):
    """MMSSCore, чей encode() делегирует swapped-энкодеру (Ollama или fallback)."""
    core = MMSSCore()

    def encode(query: str):
        return encoder(query, emb_dim)

    core.encode = encode
    return core


def quick_distill(core, teacher, train_q, test_q, epochs=60, lr=2e-3, batch=64):
    """Переобучение ℋ: ideal invariant = teacher(query)."""
    train_y = [teacher(q) for q in train_q]
    test_y = [teacher(q) for q in test_q]
    opt = torch.optim.Adam(core._hyper.parameters(), lr=lr)

    def mse(qs, ys):
        s, n = 0.0, 0
        for q, y in zip(qs, ys):
            z = core.encode(q)
            _, inv = core.forward(z)
            s += torch.nn.functional.mse_loss(inv, y).item()
            n += 1
        return s / max(n, 1)

    pre_test = mse(test_q, test_y)
    t0 = time.perf_counter()
    for ep in range(epochs):
        idx = list(range(len(train_q)))
        random.Random(SEED + ep).shuffle(idx)
        for b in range(0, len(idx), batch):
            bidx = idx[b:b + batch]
            opt.zero_grad()
            loss = 0.0
            for i in bidx:
                z = core.encode(train_q[i])
                _, inv = core.forward(z)
                loss = loss + torch.nn.functional.mse_loss(inv, train_y[i])
            (loss / len(bidx)).backward()
            opt.step()
    dt = time.perf_counter() - t0
    post_test = mse(test_q, test_y)
    return {
        "epochs": epochs, "cpu_seconds": round(dt, 2),
        "pre_test_mse": round(pre_test, 6), "post_test_mse": round(post_test, 6),
        "mse_reduction_pct": round((1 - post_test / max(pre_test, 1e-9)) * 100, 2),
    }


def quick_iso(core, queries, labels, threshold=0.85):
    """Короткий ⊘-тест (без full precision/recall ground-truth отчёта — только сводку)."""
    from mmss_distill_isomorphism import detect_isomorphisms
    res = detect_isomorphisms(core, queries, labels, threshold=threshold)
    return {k: res[k] for k in
            ["precision", "recall", "f1", "n_components", "n_edges",
             "n_predicted_isomorphism_bridges", "true_positives",
             "false_positives", "false_negatives"]}


if __name__ == "__main__":
    random.seed(SEED)
    torch.manual_seed(SEED)

    host = "http://localhost:11434"
    ollama_up = detect_ollama(host)
    print(f"=== Ollama pipeline ===")
    print(f"Ollama at {host}: {'UP' if ollama_up else 'not reachable — running FALLBACK'}")

    enc, emode = make_encoder(prefer_ollama=True, host=host, target_dim=64)
    tea, tmode = make_teacher(prefer_ollama=True, host=host)
    pipeline_mode = {
        "encoder": emode,
        "teacher": tmode,
        "ollama_detected": ollama_up,
        "note": ("REAL Ollama encoder+teacher active" if (emode == "ollama_real" and tmode == "ollama_real")
                 else "fallback active (Ollama not reachable in sandbox); locally it swaps automatically"),
    }
    print(json.dumps(pipeline_mode, ensure_ascii=False, indent=2))

    # компактный датасет для скорости pipeline
    queries, labels = gen_dataset(n_per_domain=80, n_bridges=40)
    idx = list(range(len(queries)))
    random.Random(SEED).shuffle(idx)
    cut = int(len(idx) * 0.8)
    train_q = [queries[i] for i in idx[:cut]]
    test_q = [queries[i] for i in idx[cut:]]

    core = build_swappable_core(enc, emb_dim=64)
    print(f"\nretraining ℋ with swapped teacher ({tmode})...")
    dist = quick_distill(core, tea, train_q, test_q, epochs=60)
    print("distillation:", dist)

    iso = quick_iso(core, queries, labels)
    print("⊘ quick test:", iso)

    # smoke: один цикл через swap-энкодер (соответствие контракту)
    z = core.encode("quantum fractal topology")
    w_q, inv = core.forward(z)
    print(f"sample cycle: z norm={z.norm():.4f} inv_dim={inv.numel()} | "
          f"encoder={emode}")

    out = {
        "engine": "MMSS_OLLAMA_PIPELINE",
        "version": "v2.2-ollama-swap-pipeline",
        "runtime": {"torch": torch.__version__, "cpu_only": True},
        "pipeline_mode": pipeline_mode,
        "dataset": {"train": len(train_q), "test": len(test_q),
                    "true_bridges": sum(1 for l in labels if len(l) >= 2)},
        "retraining_with_swapped_teacher": dist,
        "isomorphism_⊘_quick_test": iso,
        "sample_cycle": {"encoder_mode": emode, "z_norm": round(float(z.norm()), 4),
                         "inv_dim": int(inv.numel())},
        "honesty": "В сэндбоксе Ollama недоступен → отработал fallback. Локально с поднятым "
                   "Ollama (bge-small-en + qwen2.5) pipeline переключится на ollama_real "
                   "автоматически — код менять не нужно (encoder/teacher — pluggable callable).",
        "local_instructions": [
            "1) ollama pull bge-small-en   (или nomic-embed-text)",
            "2) ollama pull qwen2.5:7b      (или llama3.1 / phi3)",
            "3) python3 mmss_ollama_pipeline.py  → pipeline_mode должен стать ollama_real",
        ],
    }
    with open("/home/user/workspace/mmss/v22_ollama_pipeline_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\nresults -> /home/user/workspace/mmss/v22_ollama_pipeline_results.json")
