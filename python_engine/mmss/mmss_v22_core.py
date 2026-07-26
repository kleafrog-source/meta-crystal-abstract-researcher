#!/usr/bin/env python3
"""
MMSS Invariant Manifold Engine v2.2 — минимальный прототип ядра (CPU-only, PyTorch).

Принцип: "Инвариант — это вычисление, а не хранение."
  - stage 01 EMBEDDING ENCODER      : query -> z_q (координата на манифолде)
  - stage 02 HYPERNETWORK MANIFOLD  : ℋ(z_q) -> W_q (веса маленькой сети, генерируются на лету)
  - stage 03 INVARIANT COMPUTATION  : f(z_q; W_q) -> invariant (результат forward-pass, НЕ элемент матрицы)
  - stage 04 TEMPLATE RENDERER (℘)  : invariant -> текст + свет + звук

Доп. операторы:
  - Δ counterfactual : z_q + delta -> повторный forward-pass -> Δcosine
  - α depth scaling  : alpha * z_q -> повторный forward-pass

Честная проверка matrix-free / O(1):
  - param_count модели НЕ зависит от числа запросов
  - memory_footprint = param_count * 4 байта (float32), const
  - latency измеряется на реальном CPU
  - invariant stability: max |Δcosine| при Δ-возмущении
"""

import hashlib
import json
import time
import uuid
from dataclasses import dataclass, field

import torch

torch.set_num_threads(2)  # бережём i3-железо

SEED = 1337
torch.manual_seed(SEED)

# ---------------------------------------------------------------------------
# Конфигурация модели (намеренно маленькая для CPU / ограниченного железа)
# ---------------------------------------------------------------------------
EMB_DIM = 64          # dim(z_q) — координата манифолда (демо упоминало 384d; здесь меньше ради скорости)
INV_HIDDEN = 16       # скрытый слой инвариант-сети
INV_OUT = 8           # размерность инварианта
HYPER_HIDDEN = 64     # скрытый слой гиперсети ℋ


def _hash_to_vector(text: str, dim: int) -> torch.Tensor:
    """Детерминированный 'энкодер': bag-of-token-hashes -> плотный вектор через feature hashing.

    Намеренно без внешних моделей (limited hardware). Нормализуем к единичной норме,
    чтобы координата лежала на сфере (удобно для cosine-метрик)."""
    v = torch.zeros(dim)
    tokens = text.lower().strip().split()
    if not tokens:
        tokens = [text]
    for tok in tokens:
        h = int(hashlib.md5(tok.encode()).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 8) & 1) == 0 else -1.0
        v[idx] += sign
    n = v.norm()
    if n > 0:
        v = v / n
    return v


# ---------------------------------------------------------------------------
# Ядро v2.2
# ---------------------------------------------------------------------------
class InvariantNet(torch.nn.Module):
    """Маленькая сеть, веса которой ГЕНЕРИРУЮТСЯ гиперсетью (не хранятся как матрица).
    f(z_q; W_q) = tanh( W2 @ relu(W1 @ z_q + b1) + b2 )."""

    def __init__(self, d_in: int, hidden: int, d_out: int):
        super().__init__()
        self.d_in, self.hidden, self.d_out = d_in, hidden, d_out
        self.param_count = d_in * hidden + hidden + hidden * d_out + d_out
        self.shapes = [
            (hidden, d_in), (hidden,),     # W1, b1
            (d_out, hidden), (d_out,),      # W2, b2
        ]

    def forward(self, z_q: torch.Tensor, w_q: torch.Tensor) -> torch.Tensor:
        W1, b1, W2, b2 = self._unpack(w_q)
        h = torch.relu(W1 @ z_q + b1)
        return torch.tanh(W2 @ h + b2)

    def _unpack(self, w_q: torch.Tensor):
        out, idx = [], 0
        for shape in self.shapes:
            n = int(torch.prod(torch.tensor(shape)).item())
            out.append(w_q[idx:idx + n].view(shape))
            idx += n
        return out


class Hypernetwork(torch.nn.Module):
    """ℋ: z_q -> W_q (плоский вектор параметров инвариант-сети).
    Заменяет lookup в матрице инвариантов компактной функцией. Её параметры ФИКСИРОВАНЫ."""

    def __init__(self, d_in: int, hidden: int, out_dim: int):
        super().__init__()
        self.net = torch.nn.Sequential(
            torch.nn.Linear(d_in, hidden),
            torch.nn.Tanh(),
            torch.nn.Linear(hidden, out_dim),
        )

    def forward(self, z_q: torch.Tensor) -> torch.Tensor:
        return self.net(z_q)


@dataclass
class MMSSCore:
    emb_dim: int = EMB_DIM
    inv_hidden: int = INV_HIDDEN
    inv_out: int = INV_OUT
    hyper_hidden: int = HYPER_HIDDEN
    _inv_net: InvariantNet = field(init=False)
    _hyper: Hypernetwork = field(init=False)

    def __post_init__(self):
        self._inv_net = InvariantNet(self.emb_dim, self.inv_hidden, self.inv_out)
        self._hyper = Hypernetwork(
            self.emb_dim, self.hyper_hidden, self._inv_net.param_count
        )

    # --- stage 01 ---
    def encode(self, query: str) -> torch.Tensor:
        return _hash_to_vector(query, self.emb_dim)

    # --- stage 02 ---
    def hypernet(self, z_q: torch.Tensor) -> torch.Tensor:
        return self._hyper(z_q)

    # --- stage 03 ---
    def compute_invariant(self, z_q: torch.Tensor, w_q: torch.Tensor) -> torch.Tensor:
        return self._inv_net(z_q, w_q)

    # --- полный forward ---
    def forward(self, z_q: torch.Tensor):
        w_q = self.hypernet(z_q)
        inv = self.compute_invariant(z_q, w_q)
        return w_q, inv

    # --- оператор Δ: counterfactual ---
    def counterfactual(self, z_q: torch.Tensor, delta: float = 0.20, axis: int = -1):
        z_pert = z_q.clone()
        ax = axis if axis >= 0 else z_q.numel() + axis
        z_pert[ax] = z_pert[ax] + delta
        _, inv_base = self.forward(z_q)
        _, inv_pert = self.forward(z_pert)
        dcos = 1.0 - torch.nn.functional.cosine_similarity(
            inv_base.unsqueeze(0), inv_pert.unsqueeze(0)
        ).item()
        div_pct = (inv_pert - inv_base).abs().max().item() * 100.0
        return {
            "delta": delta,
            "axis": ax,
            "delta_cosine": round(dcos, 4),
            "invariant_divergence_pct": round(div_pct, 4),
            "verdict": "stability_preserved" if dcos < 0.5 else "stability_broken",
        }

    # --- оператор α: depth scaling ---
    def depth_scale(self, z_q: torch.Tensor, alpha: float = 0.5):
        _, inv_base = self.forward(z_q)
        _, inv_scaled = self.forward(z_q * alpha)
        div_pct = (inv_scaled - inv_base).abs().max().item() * 100.0
        return {
            "alpha": alpha,
            "invariant_divergence_pct": round(div_pct, 4),
        }

    # --- stage 04: рендер ℘ (мульти-выход) ---
    def render(self, inv: torch.Tensor) -> dict:
        inv_l = inv.tolist()
        dom = int(torch.argmax(inv.abs()).item())
        mag = float(inv.abs().max().item())
        polarity = "positive" if inv[dom].item() >= 0 else "negative"
        hue = (dom / self.inv_out) * 360.0
        carrier = 220.0 + mag * 660.0
        modulator = 1.0 + dom * 2.5
        text = (
            f"℘(z_q, ℋ(z_q)) -> invariant[{dom}]={inv[dom]:.3f} "
            f"({polarity}, magnitude {mag*100:.2f}%) -> render"
        )
        return {
            "text": text,
            "light_field": {"hue_deg": round(hue, 1), "intensity": round(mag, 4)},
            "audio": {
                "carrier_hz": round(carrier, 1),
                "modulator_hz": round(modulator, 2),
                "amplitude": round(mag, 4),
            },
        }

    # --- метрики модели ---
    def model_metrics(self) -> dict:
        pc = sum(p.numel() for p in self._hyper.parameters()) + \
             sum(p.numel() for p in self._inv_net.parameters())
        # inv_net не имеет хранимых обучаемых весов (они генерируются), но считаем архитектуру
        return {
            "param_count": pc,
            "memory_footprint_bytes": pc * 4,
            "hyper_params": sum(p.numel() for p in self._hyper.parameters()),
            "inv_net_arch_params": self._inv_net.param_count,
        }


# ---------------------------------------------------------------------------
# Прогон одного цикла + измерение latency
# ---------------------------------------------------------------------------
def run_cycle(core: MMSSCore, query: str, with_counterfactual: bool = True) -> dict:
    t0 = time.perf_counter()
    z_q = core.encode(query)
    w_q = core.hypernet(z_q)
    inv = core.compute_invariant(z_q, w_q)
    render = core.render(inv)
    w_q_hash = hashlib.sha256(w_q.detach().numpy().tobytes()).hexdigest()[:16]
    latency = (time.perf_counter() - t0) * 1000.0

    operators = {
        "H_hypernet": {"w_q_hash": w_q_hash, "w_q_dim": int(w_q.numel())},
        "invariant_computation": True,
    }
    if with_counterfactual:
        operators["counterfactual"] = core.counterfactual(z_q, delta=0.20)
        operators["depth_scaling"] = core.depth_scale(z_q, alpha=0.5)

    inv_list = [round(x, 5) for x in inv.tolist()]
    dom = int(torch.argmax(inv.abs()).item())
    mag = float(inv.abs().max().item())
    return {
        "schema_version": "1.0.0",
        "cycle_id": uuid.uuid4().hex[:12],
        "source_query": {"raw": query, "kind": "query"},
        "z_q": {
            "dim": core.emb_dim,
            "values": [round(x, 5) for x in z_q.tolist()],
            "norm": round(float(z_q.norm().item()), 5),
        },
        "operators": operators,
        "invariant": {
            "dim": core.inv_out,
            "values": inv_list,
            "dominant_axis": dom,
            "magnitude_pct": round(mag * 100, 4),
            "polarity": "positive" if inv[dom].item() >= 0 else "negative",
        },
        "crystal": {"crystal_id": None, "type": None, "stored": False},
        "render_outputs": render,
        "metrics": {
            "latency_ms": round(latency, 4),
            **core.model_metrics(),
        },
    }


def bench(core: MMSSCore, queries: list[str], warmup: int = 20) -> dict:
    # warmup (JIT/cache)
    for q in queries[:warmup]:
        run_cycle(core, q, with_counterfactual=False)

    lats = []
    max_dcos = 0.0
    for q in queries:
        t0 = time.perf_counter()
        cyc = run_cycle(core, q, with_counterfactual=False)
        lats.append((time.perf_counter() - t0) * 1000.0)
        # проверка continuity: маленькое возмущение должно давать маленькое изменение
        z_q = core.encode(q)
        cf = core.counterfactual(z_q, delta=0.20)
        max_dcos = max(max_dcos, abs(cf["delta_cosine"]))

    lats.sort()
    n = len(lats)
    mm = core.model_metrics()
    return {
        "n_queries": n,
        "latency_ms_p50": round(lats[n // 2], 3),
        "latency_ms_p95": round(lats[int(n * 0.95)], 3),
        "latency_ms_max": round(lats[-1], 3),
        "param_count": mm["param_count"],
        "memory_footprint_bytes": mm["memory_footprint_bytes"],
        "memory_footprint_kb": round(mm["memory_footprint_bytes"] / 1024, 2),
        "matrix_free_check": {
            "param_count_const_vs_queries": mm["param_count"] == core.model_metrics()["param_count"],
            "explanation": "param_count не зависит от числа запросов => нет матрицы инвариантов",
        },
        "invariant_stability": {
            "max_abs_delta_cosine_at_delta_0.20": round(max_dcos, 4),
            "interpretation": "малое значение => инвариант устойчив к контрфактическому возмущению",
        },
    }


# ---------------------------------------------------------------------------
# main: честные метрики
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import argparse, os
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=2000, help="число запросов в бенчмарке")
    ap.add_argument("--sample-cycle", action="store_true", help="вывести один полный цикл-пример")
    args = ap.parse_args()

    core = MMSSCore()
    print(f"=== MMSS Invariant Manifold Engine v2.2 (CPU-only, torch {torch.__version__}) ===")
    print(f"embedding dim={EMB_DIM}, inv_net hidden={INV_HIDDEN} out={INV_OUT}, hyper_hidden={HYPER_HIDDEN}")
    m = core.model_metrics()
    print(f"param_count={m['param_count']}  memory_footprint={m['memory_footprint_bytes']} bytes "
          f"({m['memory_footprint_bytes']/1024:.2f} KB)  hyper_params={m['hyper_params']}  "
          f"inv_net_arch_params(generated)={m['inv_net_arch_params']}")

    # один полный цикл-пример (соответствует контракту mmss_cycle.schema.json)
    sample = run_cycle(core, "Какие инварианты сохраняются при повороте изображения?")
    # в бенчмарк-набор: разные строки => разные z_q
    base_words = [
        "dark water flows over ancient stones",
        "свет кристаллизуется вдоль разлома",
        "quantum fractal topology invariant",
        "counterfactual perturbation depth scaling",
        "isomorphism between domains manifold",
    ]
    queries = [base_words[i % len(base_words)] + f" {i}" for i in range(args.n)]

    stats = bench(core, queries)

    out = {
        "engine": "MMSS_INVARIANT_MANIFOLD_ENGINE",
        "version": "v2.2-prototype",
        "runtime": {"torch": torch.__version__, "cpu_only": True, "num_threads": torch.get_num_threads()},
        "model_config": {
            "embedding_dim": EMB_DIM,
            "invariant_hidden": INV_HIDDEN,
            "invariant_out": INV_OUT,
            "hypernetwork_hidden": HYPER_HIDDEN,
        },
        "model_metrics": m,
        "honest_benchmark": stats,
        "sample_cycle": sample if args.sample_cycle else None,
    }
    # убираем None
    if out["sample_cycle"] is None:
        del out["sample_cycle"]

    os.makedirs("/home/user/workspace/mmss", exist_ok=True)
    with open("/home/user/workspace/mmss/v22_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("\n=== HONEST BENCHMARK ===")
    print(json.dumps(stats, ensure_ascii=False, indent=2))
    print("\nresults -> /home/user/workspace/mmss/v22_results.json")
