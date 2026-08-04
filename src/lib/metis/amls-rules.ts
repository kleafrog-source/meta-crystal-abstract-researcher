import type { Matrix } from "@/lib/metis/math-core";
import { orthogonality, variance } from "@/lib/metis/math-core";

export interface AmlsRuleResult {
  id: string;
  name: string;
  formula: string;
  function_ru: string;
  value: number;
  threshold: number;
  triggered: boolean;
}

export function evaluateAmlsRules(args: {
  M: Matrix;
  M_old: Matrix | null;
  overflow_risk: number;
  gdn_stability: number;
  memory_recall_accuracy: number;
  prev_recall_accuracy: number | null;
  candidates: number[];
  perf_per_rank: number[];
  federated_quality: number[];
  fractal_layer_norm: number;
  scq_per_node: number[];
  intentional_forget_rate: number;
  target_forget_rate: number;
}): AmlsRuleResult[] {
  const results: AmlsRuleResult[] = [];

  let bestRank = args.candidates[0];
  let bestPerf = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < args.candidates.length; index += 1) {
    if (args.perf_per_rank[index] > bestPerf) {
      bestPerf = args.perf_per_rank[index];
      bestRank = args.candidates[index];
    }
  }

  const interference = args.M_old ? 1 - orthogonality(args.M, args.M_old) : 0;
  const temporalStability =
    args.prev_recall_accuracy === null
      ? 1
      : 1 - Math.abs(args.memory_recall_accuracy - args.prev_recall_accuracy) / Math.max(args.memory_recall_accuracy, 1e-6);
  const fedVariance = args.federated_quality.length > 1 ? variance(args.federated_quality) : 0;
  const qfLoss = 0.01 * args.fractal_layer_norm;
  const minScq = args.scq_per_node.length ? Math.min(...args.scq_per_node) : 1;
  const forgetPenalty = Math.abs(args.intentional_forget_rate - args.target_forget_rate);

  results.push(
    {
      id: "RULE_METIS_1_RANK_OPTIMIZATION",
      name: "Rank Optimization",
      formula: `rank_opt = argmax_r Performance(r) -> ${bestRank}`,
      function_ru: "Подстройка ранга памяти под текущую нагрузку.",
      value: bestRank,
      threshold: 64,
      triggered: bestRank !== 64,
    },
    {
      id: "RULE_METIS_2_OVERFLOW_PREVENTION",
      name: "Overflow Prevention",
      formula: `overflow_risk = ${args.overflow_risk.toFixed(4)}`,
      function_ru: "Контроль переполнения матрицы памяти.",
      value: args.overflow_risk,
      threshold: 0.9,
      triggered: args.overflow_risk > 0.9,
    },
    {
      id: "RULE_METIS_3_INTERFERENCE_CONTROL",
      name: "Interference Control",
      formula: `interference = ${interference.toFixed(4)}`,
      function_ru: "Контроль взаимного искажения между состояниями памяти.",
      value: interference,
      threshold: 0.3,
      triggered: interference > 0.3,
    },
    {
      id: "RULE_METIS_4_TEMPORAL_STABILITY",
      name: "Temporal Stability",
      formula: `temp_stab = ${temporalStability.toFixed(4)}`,
      function_ru: "Стабильность качества recall во времени.",
      value: temporalStability,
      threshold: 0.95,
      triggered: temporalStability < 0.95,
    },
    {
      id: "RULE_METIS_5_GDN_STABILITY",
      name: "GDN Stability",
      formula: `gdn_stab = ${args.gdn_stability.toFixed(4)}`,
      function_ru: "Устойчивость GDN-обновлений.",
      value: args.gdn_stability,
      threshold: 0.99,
      triggered: args.gdn_stability < 0.99,
    },
    {
      id: "RULE_2_FEDERATED_STABILITY",
      name: "Federated Stability",
      formula: `Var(q) = ${fedVariance.toFixed(6)}`,
      function_ru: "Разброс качества edge-обновлений.",
      value: fedVariance,
      threshold: 0.01,
      triggered: fedVariance > 0.01,
    },
    {
      id: "RULE_3_QF_REGULARIZATION",
      name: "QF Regularization",
      formula: `qf_loss = ${qfLoss.toFixed(6)}`,
      function_ru: "Регуляризация квантово-фрактального слоя.",
      value: qfLoss,
      threshold: 0.1,
      triggered: qfLoss > 0.1,
    },
    {
      id: "RULE_4_SCQ_GATEKEEPING",
      name: "SCQ Gatekeeping",
      formula: `min_scq = ${minScq.toFixed(4)}`,
      function_ru: "Проверка самодостаточности memory-node.",
      value: minScq,
      threshold: 1,
      triggered: minScq < 1,
    },
    {
      id: "RULE_6_FORGET_CONTROL",
      name: "Forget Control",
      formula: `forget_penalty = ${forgetPenalty.toFixed(4)}`,
      function_ru: "Слежение за темпом забывания.",
      value: forgetPenalty,
      threshold: 0.05,
      triggered: forgetPenalty > 0.05,
    },
  );

  return results;
}

