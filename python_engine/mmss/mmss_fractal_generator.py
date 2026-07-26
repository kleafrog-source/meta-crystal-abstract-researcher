#!/usr/bin/env python3
"""
MMSS v3.0 — оператор ⊛: НАСТОЯЩИЙ самоподобный генератор весов.

Спецификация v3.0: «итеративный фрактальный генератор весов ⊛,
формула ~n→∞ F^n(W₀, z_q); самоподобная структура кодирует изоморфизмы
на всех масштабах; заменяет линейную гиперсеть v2.2».

Реализация (multi-octave residual IFS — не брендирование, а механизм):
  W_0 = seed_projection(z_q)
  для каждого шага глубины n:
    разбить W на K октав (блоков) одинакового размера
    к КАЖДОЙ октаве применить ОДНО И ТО ЖЕ правило (самоподобие):
        block' = tanh( a*block + b*roll(block, k) + c*context_block )
        с масштабом s_i на октаву i (форма общая, масштаб разный)
    собрать блоки обратно
    остаточное сжатие (contraction): W_{n+1} = (1-rho)*W + rho*F(W, z_q)
  вернуть W_n

Свойства, которые реально измеряем:
  - самоподобие: одно правило a,b,c,roll применяется ко всем октавам
  - стабильность: residual contraction (rho<1) — нет взрыва норм
  - depth scaling: число итераций n = реальный контроль глубины
  - сходимость: ||W_n - W_{n-1}|| -> 0
  - drift инварианта по глубине
"""

import json
import time

import torch

from mmss_v22_core import MMSSCore, InvariantNet, SEED
from mmss_distill_isomorphism import (
    gen_dataset, teacher_invariant, detect_isomorphisms,
    domain_cosine_diagnostics,
)

torch.manual_seed(SEED)


class FractalWeightGenerator(torch.nn.Module):
    """⊛: итеративный самоподобный генератор весов инвариант-сети."""

    def __init__(self, emb_dim: int, param_count: int,
                 n_octaves: int = 8, rho: float = 0.5, roll_k: int = 1):
        super().__init__()
        assert param_count % n_octaves == 0, \
            f"param_count {param_count} must be divisible by n_octaves {n_octaves}"
        self.emb_dim = emb_dim
        self.param_count = param_count
        self.n_octaves = n_octaves
        self.block_size = param_count // n_octaves
        self.rho = rho
        self.roll_k = roll_k

        # seed projection z_q -> W_0
        self.seed_proj = torch.nn.Linear(emb_dim, param_count)
        # context projection z_q -> context (той же формы)
        self.ctx_proj = torch.nn.Linear(emb_dim, param_count)
        # ОБУЧАЕМЫЕ, но ОБЩИЕ для всех октав параметры правила (самоподобие):
        self.a = torch.nn.Parameter(torch.tensor(0.8))
        self.b = torch.nn.Parameter(torch.tensor(0.3))
        self.c = torch.nn.Parameter(torch.tensor(0.5))
        # per-octave масштабы (форма правила общая, масштаб разный)
        self.scales = torch.nn.Parameter(torch.ones(n_octaves))

    def forward(self, z_q: torch.Tensor, depth: int = 4) -> torch.Tensor:
        W = self.seed_proj(z_q)               # W_0
        ctx = self.ctx_proj(z_q)              # контекст
        ctx_blocks = ctx.view(self.n_octaves, self.block_size)
        for _ in range(depth):
            blocks = W.view(self.n_octaves, self.block_size)
            rolled = torch.roll(blocks, shifts=self.roll_k, dims=1)
            # одинаковое правило ко всем октавам, масштаб per-octave
            f = torch.tanh(
                self.a * blocks + self.b * rolled + self.c * ctx_blocks
            ) * self.scales.unsqueeze(1)
            F_flat = f.view(-1)
            W = (1.0 - self.rho) * W + self.rho * F_flat
        return W


class FractalMMSSCore:
    """Ядро MMSS, где линейная гиперсеть ℋ заменена на ⊛ (FractalWeightGenerator).
    inv = f(z_q; ⊛(z_q, depth)). Глубина depth = реальный depth-scaling."""

    def __init__(self, emb_dim: int = 64, inv_hidden: int = 16, inv_out: int = 8,
                 hyper_hidden: int = 64, depth: int = 4, n_octaves: int = 8):
        self.emb_dim = emb_dim
        self.inv_hidden = inv_hidden
        self.inv_out = inv_out
        self.hyper_hidden = hyper_hidden
        self.depth = depth
        self._inv_net = InvariantNet(emb_dim, inv_hidden, inv_out)
        self._fractal = FractalWeightGenerator(
            emb_dim, self._inv_net.param_count, n_octaves=n_octaves)

    def encode(self, query: str):
        from mmss_v22_core import _hash_to_vector
        return _hash_to_vector(query, self.emb_dim)

    def hypernet(self, z_q: torch.Tensor):
        return self._fractal(z_q, self.depth)

    def compute_invariant(self, z_q, w_q):
        return self._inv_net(z_q, w_q)

    def forward(self, z_q, depth=None):
        d = self.depth if depth is None else depth
        w_q = self._fractal(z_q, d)
        return w_q, self._inv_net(z_q, w_q)

    def model_metrics(self):
        pc = sum(p.numel() for p in self._fractal.parameters())
        return {
            "param_count": pc,
            "memory_footprint_bytes": pc * 4,
            "generator": "fractal_⊛_multi_octave_residual_IFS",
            "depth": self.depth,
            "n_octaves": self._fractal.n_octaves,
            "inv_net_arch_params": self._inv_net.param_count,
        }


# ---------------------------------------------------------------------------
# Измерение поведения ⊛
# ---------------------------------------------------------------------------
def measure_fractal_behavior(core: FractalMMSSCore, queries, max_depth=8):
    """Сходимость по глубине + drift инварианта + latency."""
    z = core.encode(queries[0])
    conv_curve = []
    prev_w = None
    for d in range(1, max_depth + 1):
        w = core._fractal(z, d)
        if prev_w is not None:
            conv_curve.append(round(float((w - prev_w).norm().item()), 6))
        prev_w = w

    # drift инварианта по глубине (cosine к глубине 1)
    _, inv_d1 = core.forward(z, depth=1)
    drift = []
    for d in range(1, max_depth + 1):
        _, inv = core.forward(z, depth=d)
        c = torch.nn.functional.cosine_similarity(
            inv_d1.unsqueeze(0), inv.unsqueeze(0)).item()
        drift.append(round(c, 4))

    # latency vs depth
    lats = {}
    for d in [1, 4, 8]:
        ts = []
        for q in queries[:30]:
            t0 = time.perf_counter()
            zz = core.encode(q)
            core.forward(zz, depth=d)
            ts.append((time.perf_counter() - t0) * 1000)
        lats[f"depth_{d}_ms_p50"] = round(sorted(ts)[len(ts) // 2], 4)

    return {
        "convergence_curve_||W_n-W_{n-1}||": conv_curve,
        "invariant_drift_cosine_to_depth1": drift,
        "latency_by_depth": lats,
        "interpretation": "convergence->0 = stable contraction; drift показывает, насколько глубина меняет инвариант (мультимасштабность)",
    }


def distill_fractal(core, train_q, train_y, test_q, test_y, epochs=150, lr=2e-3, batch=64):
    opt = torch.optim.Adam(core._fractal.parameters(), lr=lr)

    def mse(qs, ys):
        s, n = 0.0, 0
        for q, y in zip(qs, ys):
            z = core.encode(q)
            _, inv = core.forward(z)
            s += torch.nn.functional.mse_loss(inv, y).item()
            n += 1
        return s / max(n, 1)

    pre_train, pre_test = mse(train_q, train_y), mse(test_q, test_y)
    t0 = time.perf_counter()
    for ep in range(epochs):
        idx = list(range(len(train_q)))
        import random
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
    return {
        "epochs": epochs, "cpu_seconds": round(dt, 2),
        "pre_train_mse": round(pre_train, 6), "post_train_mse": round(mse(train_q, train_y), 6),
        "pre_test_mse": round(pre_test, 6), "post_test_mse": round(mse(test_q, test_y), 6),
    }


if __name__ == "__main__":
    import random
    random.seed(SEED)
    torch.manual_seed(SEED)

    # эталон: линейная ℋ (v2.2 checkpoint)
    linear_core = MMSSCore()
    ck = torch.load("/home/user/workspace/mmss/v22_hyper_synthetic_distilled.pt",
                    map_location="cpu", weights_only=False)
    linear_core._hyper.load_state_dict(ck["hyper_state_dict"])

    # ⊛ фрактальное ядро
    fractal_core = FractalMMSSCore(depth=4)
    print("=== ⊛ fractal core config ===")
    print(fractal_core.model_metrics())

    queries, labels = gen_dataset(n_per_domain=120, n_bridges=60)
    import random as _r
    idx = list(range(len(queries)))
    _r.Random(SEED).shuffle(idx)
    cut = int(len(idx) * 0.8)
    tr, te = idx[:cut], idx[cut:]
    train_q = [queries[i] for i in tr]
    train_y = [teacher_invariant(queries[i]) for i in tr]
    test_q = [queries[i] for i in te]
    test_y = [teacher_invariant(queries[i]) for i in te]

    # поведение ⊛ до обучения
    behavior = measure_fractal_behavior(fractal_core, queries, max_depth=8)
    print("\n=== ⊛ behavior (untrained) ===")
    print(json.dumps(behavior, ensure_ascii=False, indent=2))

    # дистилляция ⊛
    print("\n=== distilling ⊛ ===")
    dist = distill_fractal(fractal_core, train_q, train_y, test_q, test_y, epochs=150)
    print(dist)

    # косинусная диагностика ⊛ после обучения
    post_diag = domain_cosine_diagnostics(fractal_core, queries, labels)
    print("post diag:", post_diag)

    # ⊘ на ⊛
    iso_fractal = detect_isomorphisms(fractal_core, queries, labels, threshold=0.85)
    # ⊘ на линейной ℋ для сравнения
    iso_linear = detect_isomorphisms(linear_core, queries, labels, threshold=0.85)

    out = {
        "engine": "MMSS_FRACTAL_WEIGHT_GENERATOR_⊛",
        "version": "v3.0-prototype",
        "runtime": {"torch": torch.__version__, "cpu_only": True},
        "fractal_core_config": fractal_core.model_metrics(),
        "design": {
            "mechanism": "multi-octave residual IFS: одинаковое правило (a,b,c,roll) ко всем октавам + per-octave масштаб; residual contraction rho<1",
            "self_similarity": "одно правило для всех октав/масштабов",
            "stability": "residual contraction (rho=0.5) — нет взрыва норм",
            "depth_scaling": "число итераций depth = реальный контроль глубины",
            "faithful_to_v3.0_spec": True,
            "note": "реализован механизм ⊛; не брендирование. Не утверждаем, что ⊛ лучше ℋ — измеряем честно.",
        },
        "fractal_behavior_untrained": behavior,
        "distillation": dist,
        "cosine_diagnostics_post_training": post_diag,
        "isomorphism_⊘_comparison": {
            "fractal_⊛": {k: iso_fractal[k] for k in
                          ["precision", "recall", "f1", "n_predicted_isomorphism_bridges",
                           "true_positives", "false_positives", "false_negatives"]},
            "linear_ℋ": {k: iso_linear[k] for k in
                         ["precision", "recall", "f1", "n_predicted_isomorphism_bridges",
                          "true_positives", "false_positives", "false_negatives"]},
        },
        "honest_note": "Сравнение ⊛ vs ℋ на синтетике. Если ⊛ проигрывает линейной ℋ — это всё равно валидный результат: механизм реализован и измерен.",
    }
    with open("/home/user/workspace/mmss/v3_fractal_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\nresults -> /home/user/workspace/mmss/v3_fractal_results.json")
    print("⊘ ⊛:", {k: iso_fractal[k] for k in ["precision", "recall", "f1"]},
          "| ⊘ ℋ:", {k: iso_linear[k] for k in ["precision", "recall", "f1"]})
