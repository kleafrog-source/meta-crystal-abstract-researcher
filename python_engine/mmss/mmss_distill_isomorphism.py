#!/usr/bin/env python3
"""
MMSS v2.2 — расширение: дистилляция ℋ + оператор ⊘ (обнаружение изоморфизмов).

ЧАСТЬ 1. Дистилляция гиперсети ℋ.
  «Учитель» — СИНТЕТИЧЕСКИЙ (не LLM): честная заглушка, валидирующая цикл обучения.
  Каждый запрос размечен доменами; идеальный инвариант учителя = нормированная сумма
  фиксированных 8-dim сигнатур доменов, tanh. ℋ учится воспроизводить эти инварианты:
      loss = MSE( f(z_q; ℋ(z_q)), teacher_invariant(query) )
  Обучаются только параметры ℋ (веса инвариант-сети генерируются — матрицы инвариантов нет).

ЧАСТЬ 2. Оператор ⊘ — обнаружение изоморфизмов в ИНВАРИАНТНОМ пространстве.
  - считаем инварианты для библиотеки запросов
  - косинусная близость → граф → связные компоненты = кластеры
  - «мосты» (isomorphisms) = запросы, у которых есть соседи (cos>thr) из ≥2 разных доменов
  - ground truth: запросы с ≥2 доменными метками = истинные изоморфизмы
  - ↯ фазовый переход: вставка запроса объединяет компоненты с разными доминирующими доменами

Принципиальная честность: это валидация МЕХАНИЗМА (цикл обучения + оператор ⊘),
а не решения семантической задачи изоморфизма. Цикл совместим с LLM-учителем.
"""

import hashlib
import json
import random
import time
import uuid
from collections import defaultdict

import torch

from mmss_v22_core import MMSSCore, SEED

torch.manual_seed(SEED)
random.seed(SEED)

# ---------------------------------------------------------------------------
# Синтетический учитель (LLM-teacher-compatible дистилляционный цикл)
# ---------------------------------------------------------------------------
DOMAINS = ["audio", "quantum", "crypto", "topology", "counterfactual", "isomorphism"]

DOMAIN_VOCAB = {
    "audio": ["sound", "music", "audio", "waveform", "resonance", "fm", "synthesis", "звук", "волна"],
    "quantum": ["quantum", "superposition", "fractal", "phase", "coherence", "квант", "суперпозиция"],
    "crypto": ["crypto", "hash", "cipher", "key", "invariant", "крипто", "хэш", "шифр"],
    "topology": ["topology", "manifold", "graph", "node", "plane", "топология", "граф", "узел"],
    "counterfactual": ["counterfactual", "delta", "depth", "perturbation", "whatif", "контрфакт", "возмущение"],
    "isomorphism": ["isomorphism", "domain", "bridge", "link", "parallel", "изоморфизм", "мост", "связь"],
}

# фиксированные сигнатуры доменов в пространстве инвариантов (8-dim)
_dom_sig = {}
g = torch.Generator().manual_seed(4242)
for d in DOMAINS:
    v = torch.randn(8, generator=g)
    _dom_sig[d] = v / v.norm()


def teacher_invariant(query: str) -> torch.Tensor:
    """Идеальный инвариант учителя: сумма сигнатур присутствующих доменов, tanh."""
    ql = query.lower()
    present = [d for d in DOMAINS if any(w in ql for w in DOMAIN_VOCAB[d])]
    if not present:
        present = ["isomorphism"]
    acc = sum(_dom_sig[d] for d in present)
    acc = acc / acc.norm()
    return torch.tanh(acc * 1.5)


def query_domains(query: str) -> set:
    ql = query.lower()
    return {d for d in DOMAINS if any(w in ql for w in DOMAIN_VOCAB[d])}


# ---------------------------------------------------------------------------
# Генерация датасета: одно-доменные + кросс-доменные (мосты) запросы
# ---------------------------------------------------------------------------
def gen_dataset(n_per_domain=120, n_bridges=60):
    queries, labels = [], []
    for d in DOMAINS:
        for i in range(n_per_domain):
            # вариативный одно-доменный запрос
            kw = random.sample(DOMAIN_VOCAB[d], k=min(2, len(DOMAIN_VOCAB[d])))
            q = f"{d} probe {i} " + " ".join(kw) + f" seed{random.randint(0,9999)}"
            queries.append(q)
            labels.append({d})
    # кросс-доменные мосты (ground-truth isomorphisms): 2 случайных домена
    for i in range(n_bridges):
        d1, d2 = random.sample(DOMAINS, 2)
        k1 = random.choice(DOMAIN_VOCAB[d1])
        k2 = random.choice(DOMAIN_VOCAB[d2])
        q = f"bridge {i} {k1} {k2} link{random.randint(0,9999)}"
        queries.append(q)
        labels.append({d1, d2})
    return queries, labels


# ---------------------------------------------------------------------------
# Дистилляция
# ---------------------------------------------------------------------------
def distill(core: MMSSCore, train_q, train_y, test_q, test_y, epochs=400, lr=2e-3, batch=64):
    opt = torch.optim.Adam(core._hyper.parameters(), lr=lr)

    def mse(qs, ys):
        total, n = 0.0, 0
        for q, y in zip(qs, ys):
            z = core.encode(q)
            _, inv = core.forward(z)
            total += torch.nn.functional.mse_loss(inv, y).item()
            n += 1
        return total / max(n, 1)

    pre_train = mse(train_q, train_y)
    pre_test = mse(test_q, test_y)

    t0 = time.perf_counter()
    history = []
    for ep in range(epochs):
        idx = list(range(len(train_q)))
        random.shuffle(idx)
        ep_loss = 0.0
        for b in range(0, len(idx), batch):
            bidx = idx[b:b + batch]
            opt.zero_grad()
            loss = 0.0
            for i in bidx:
                z = core.encode(train_q[i])
                _, inv = core.forward(z)
                loss = loss + torch.nn.functional.mse_loss(inv, train_y[i])
            loss = loss / len(bidx)
            loss.backward()
            opt.step()
            ep_loss += loss.item()
        if ep % 50 == 0 or ep == epochs - 1:
            history.append({"epoch": ep, "train_mse": round(ep_loss / (len(idx) / batch), 6)})
    dt = time.perf_counter() - t0

    post_train = mse(train_q, train_y)
    post_test = mse(test_q, test_y)
    return {
        "epochs": epochs,
        "lr": lr,
        "batch": batch,
        "cpu_seconds": round(dt, 2),
        "pre_train_mse": round(pre_train, 6),
        "pre_test_mse": round(pre_test, 6),
        "post_train_mse": round(post_train, 6),
        "post_test_mse": round(post_test, 6),
        "mse_reduction_pct": round((1 - post_test / max(pre_test, 1e-9)) * 100, 2),
        "history": history,
        "teacher": "synthetic (LLM-teacher-compatible loop); validates mechanism, not semantic quality",
    }


# ---------------------------------------------------------------------------
# Косинусные диагностики до/после
# ---------------------------------------------------------------------------
def domain_cosine_diagnostics(core: MMSSCore, queries, labels):
    invs = []
    for q in queries:
        z = core.encode(q)
        _, inv = core.forward(z)
        invs.append(inv.detach())
    n = len(queries)
    single_mask = [len(labels[i]) == 1 for i in range(n)]
    same_vals, diff_vals = [], []
    for i in range(n):
        if not single_mask[i]:
            continue
        for j in range(i + 1, n):
            if not single_mask[j]:
                continue
            c = torch.nn.functional.cosine_similarity(
                invs[i].unsqueeze(0), invs[j].unsqueeze(0)).item()
            if labels[i] == labels[j]:
                same_vals.append(c)
            else:
                diff_vals.append(c)
    return {
        "avg_same_domain_cosine": round(sum(same_vals) / max(len(same_vals), 1), 4),
        "avg_diff_domain_cosine": round(sum(diff_vals) / max(len(diff_vals), 1), 4),
        "n_same_pairs": len(same_vals),
        "n_diff_pairs": len(diff_vals),
        "n_cross_domain_bridges": sum(1 for l in labels if len(l) >= 2),
    }


# ---------------------------------------------------------------------------
# Оператор ⊘: обнаружение изоморфизмов в инвариантном пространстве
# ---------------------------------------------------------------------------
def detect_isomorphisms(core: MMSSCore, queries, labels, threshold=0.85):
    invs = []
    for q in queries:
        z = core.encode(q)
        _, inv = core.forward(z)
        invs.append(inv.detach())

    n = len(queries)
    # косинусная матрица
    sim = torch.zeros(n, n)
    for i in range(n):
        for j in range(n):
            if i != j:
                sim[i, j] = torch.nn.functional.cosine_similarity(
                    invs[i].unsqueeze(0), invs[j].unsqueeze(0)).item()

    # граф: ребро если sim > threshold
    adj = defaultdict(set)
    edges = 0
    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] > threshold:
                adj[i].add(j)
                adj[j].add(i)
                edges += 1

    # связные компоненты (union-find)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for i in range(n):
        for j in adj[i]:
            union(i, j)

    comps = defaultdict(list)
    for i in range(n):
        comps[find(i)].append(i)

    # доминирующий домен компоненты
    def dom_domain(comp):
        cnt = defaultdict(int)
        for i in comp:
            for d in labels[i]:
                cnt[d] += 1
        return max(cnt, key=cnt.get) if cnt else None

    comp_info = []
    for c, members in comps.items():
        comp_info.append({
            "size": len(members),
            "dominant_domain": dom_domain(members),
            "members_sample": members[:3],
        })

    # предсказанные мосты (isomorphisms): запрос, у которого есть ОДНОДОМЕННЫЕ
    # соседи из ≥2 разных доменов. Это отличает настоящий мост (между двумя
    # доменными кластерами) от однодоменного запроса, просто стоящего рядом с мостом.
    predicted_bridges = []
    for i in range(n):
        neighbor_domains = set()
        for j in adj[i]:
            if len(labels[j]) == 1:  # только однодоменные соседи
                neighbor_domains |= labels[j]
        if len(neighbor_domains) >= 2:
            predicted_bridges.append(i)

    # ground truth: запросы с ≥2 доменными метками
    true_bridges = set(i for i in range(n) if len(labels[i]) >= 2)
    pred_set = set(predicted_bridges)
    tp = len(pred_set & true_bridges)
    fp = len(pred_set - true_bridges)
    fn = len(true_bridges - pred_set)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-9)

    # примеры false positives
    fp_examples = []
    for i in (pred_set - true_bridges):
        fp_examples.append({"query": queries[i], "labels": sorted(labels[i]),
                            "neighbor_domains": sorted({d for j in adj[i] for d in labels[j]})})
        if len(fp_examples) >= 3:
            break

    return {
        "space": "invariant (post-training f(z_q; ℋ(z_q)))",
        "cosine_threshold": threshold,
        "n_queries": n,
        "n_edges": edges,
        "n_components": len(comps),
        "components": comp_info,
        "n_predicted_isomorphism_bridges": len(predicted_bridges),
        "n_true_bridges": len(true_bridges),
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "false_positive_examples": fp_examples,
    }


# ---------------------------------------------------------------------------
# ↯ фазовый переход: инкрементальная вставка
# ---------------------------------------------------------------------------
def phase_transitions(core: MMSSCore, queries, labels, threshold=0.85):
    invs = []
    for q in queries:
        z = core.encode(q)
        _, inv = core.forward(z)
        invs.append(inv.detach())

    n = len(queries)
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    comp_domain = [set(labels[i]) for i in range(n)]  # домены компоненты
    adj = defaultdict(set)

    transitions = 0
    transition_log = []
    for i in range(n):
        # добавляем запрос i, соединяем с уже вставленными
        new_links = set()
        for j in range(i):  # только уже вставленные
            c = torch.nn.functional.cosine_similarity(
                invs[i].unsqueeze(0), invs[j].unsqueeze(0)).item()
            if c > threshold:
                adj[i].add(j)
                adj[j].add(i)
                ri, rj = find(i), find(j)
                if ri != rj:
                    # объединение компонентов с разными доминирующими доменами?
                    di, dj = comp_domain[ri], comp_domain[rj]
                    merged = di | dj
                    if di and dj and not di.issubset(dj) and not dj.issubset(di):
                        transitions += 1
                        if len(transition_log) < 5:
                            transition_log.append({
                                "at_query_idx": i,
                                "query": queries[i],
                                "merged_domains": sorted(merged),
                            })
                    parent[ri] = rj
                    comp_domain[rj] = merged

    return {
        "n_insertions": n,
        "n_phase_transitions": transitions,
        "definition": "↯ срабатывает, если вставка запроса объединяет компоненты с разными (непересекающимися) доминирующими доменами",
        "first_transitions": transition_log,
    }


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    torch.manual_seed(SEED)
    random.seed(SEED)

    core = MMSSCore()
    queries, labels = gen_dataset(n_per_domain=120, n_bridges=60)
    # train/test split 80/20
    idx = list(range(len(queries)))
    random.shuffle(idx)
    cut = int(len(idx) * 0.8)
    tr, te = idx[:cut], idx[cut:]
    train_q = [queries[i] for i in tr]
    train_y = [teacher_invariant(queries[i]) for i in tr]
    test_q = [queries[i] for i in te]
    test_y = [teacher_invariant(queries[i]) for i in te]

    print(f"dataset: {len(queries)} queries, {len(train_q)} train / {len(test_q)} test")
    print(f"true cross-domain bridges in full set: {sum(1 for l in labels if len(l)>=2)}")

    # ---- диагностика ДО обучения ----
    pre_diag = domain_cosine_diagnostics(core, queries, labels)
    print("PRE-training diagnostics:", pre_diag)

    # ---- дистилляция ----
    dist = distill(core, train_q, train_y, test_q, test_y, epochs=300, lr=2e-3, batch=64)
    print("distillation:", {k: dist[k] for k in ["pre_test_mse", "post_test_mse", "mse_reduction_pct", "cpu_seconds"]})

    # ---- диагностика ПОСЛЕ обучения ----
    post_diag = domain_cosine_diagnostics(core, queries, labels)
    print("POST-training diagnostics:", post_diag)

    # ---- ⊘ до и после (для сравнения) ----
    # повторно измеряем ⊘: нужен fresh порядок — используем тот же queries/labels
    iso_post = detect_isomorphisms(core, queries, labels, threshold=0.85)

    # ↯
    phase = phase_transitions(core, queries, labels, threshold=0.85)

    # чтобы измерить ⊘ ДО обучения (untrained baseline): fresh ядро с тем же SEED
    core_pre = MMSSCore()
    iso_pre = detect_isomorphisms(core_pre, queries, labels, threshold=0.85)

    # сохранить обученную ℋ как артефакт
    checkpoint = {
        "engine": "MMSS_INVARIANT_MANIFOLD_ENGINE",
        "version": "v2.2-distill-isomorphism",
        "hyper_state_dict": core._hyper.state_dict(),
        "model_config": {
            "embedding_dim": core.emb_dim,
            "invariant_hidden": core.inv_hidden,
            "invariant_out": core.inv_out,
            "hypernetwork_hidden": core.hyper_hidden,
            "param_count": core.model_metrics()["param_count"],
        },
        "teacher_note": "synthetic (LLM-teacher-compatible loop); validates mechanism, not semantic quality",
        "training_metrics": {
            "epochs": dist["epochs"],
            "cpu_seconds": dist["cpu_seconds"],
            "pre_test_mse": dist["pre_test_mse"],
            "post_test_mse": dist["post_test_mse"],
            "mse_reduction_pct": dist["mse_reduction_pct"],
        },
    }
    ckpt_path = "/home/user/workspace/mmss/v22_hyper_synthetic_distilled.pt"
    torch.save(checkpoint, ckpt_path)
    print("checkpoint ->", ckpt_path)

    out = {
        "engine": "MMSS_INVARIANT_MANIFOLD_ENGINE",
        "version": "v2.2-distill-isomorphism",
        "runtime": {"torch": torch.__version__, "cpu_only": True, "num_threads": torch.get_num_threads()},
        "dataset": {
            "total_queries": len(queries),
            "train": len(train_q),
            "test": len(test_q),
            "true_cross_domain_bridges": sum(1 for l in labels if len(l) >= 2),
            "domains": DOMAINS,
            "synthetic": True,
        },
        "part1_distillation": dist,
        "cosine_diagnostics": {"pre_training": pre_diag, "post_training": post_diag},
        "part2_isomorphism_operator": {
            "pre_training": iso_pre,
            "post_training": iso_post,
        },
        "phase_transition_operator": phase,
        "honesty_note": "Учитель синтетический (не LLM). Результат валидирует МЕХАНИЗМ (цикл обучения ℋ + оператор ⊘), а не решение семантической задачи изоморфизма. Цикл совместим с LLM-учителем: замени teacher_invariant() на выход реальной модели — обучается так же.",
    }
    with open("/home/user/workspace/mmss/v22_distill_iso_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\nresults -> /home/user/workspace/mmss/v22_distill_iso_results.json")
    print("⊘ post-training precision/recall/f1:",
          iso_post["precision"], iso_post["recall"], iso_post["f1"])
