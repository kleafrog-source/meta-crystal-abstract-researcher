import importlib.util
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "prepare-combinatorial-corpus.py"
SPEC = importlib.util.spec_from_file_location("prepare_combinatorial_corpus", SCRIPT_PATH)
assert SPEC and SPEC.loader
corpus = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(corpus)


def parameter(name: str, occurrences: int = 1) -> dict:
    return {
        "technical_name": name,
        "category": "Testing",
        "ui_element": "Range",
        "unit": "normalized_ratio",
        "_collection": {"occurrence_count": occurrences},
    }


class CorpusPreparationTests(unittest.TestCase):
    def test_quality_gate_excludes_repeated_generation_artifact(self) -> None:
        clean = parameter("spectral_centroid_shift_hz")
        artifact = parameter("spectral_gain_offset_scale_factor_offset_scale_factor")

        eligible, report = corpus.build_quality_gate([clean, artifact])

        self.assertEqual([clean], eligible)
        self.assertEqual(1, report["excluded_records"])
        self.assertEqual("repeated_token_sequence", report["flagged_records"][0]["flags"][0]["code"])

    def test_atom_corpus_keeps_frequency_weight_and_provenance(self) -> None:
        parameters = [
            parameter("spectral_centroid_shift_hz", occurrences=3),
            parameter("spectral_flux_threshold_ratio", occurrences=2),
        ]

        atoms = {item["atom"]: item for item in corpus.build_atom_corpus(parameters)}

        self.assertEqual(2, atoms["spectral"]["parameter_frequency"])
        self.assertEqual(5, atoms["spectral"]["occurrence_weight"])
        self.assertEqual(2, len(atoms["spectral"]["source_parameters"]))
        self.assertEqual("unit", atoms["hz"]["role"])
        self.assertEqual("property", atoms["threshold"]["role"])

    def test_semantic_review_does_not_auto_decide(self) -> None:
        parameters = [parameter("alpha_frequency_hz"), parameter("beta_frequency_hz")]
        vectors = [[1.0, 0.0], [0.8, 0.6]]
        queue, report = corpus.build_semantic_review(parameters, vectors, {"model": "test"})

        self.assertEqual(1, len(queue))
        self.assertEqual("pending", queue[0]["review_status"])
        self.assertIsNone(queue[0]["decision"])
        self.assertFalse(report["automatic_merge"])

    def test_auto_triage_marks_structural_alias_as_same(self) -> None:
        left = parameter("analog_current_decay_rate")
        right = parameter("analog_current_decay_speed")
        left["unit"] = "decay_rate"
        right["unit"] = "decay_speed"
        pair = {"cosine_similarity": 0.98, "token_jaccard": 0.6}

        decision, confidence, reasons = corpus.classify_semantic_pair(pair, left, right, 0.90, 0.95)

        self.assertEqual("same", decision)
        self.assertGreater(confidence, 0.9)
        self.assertTrue(any("multiset" in reason for reason in reasons))

    def test_auto_triage_keeps_meaningful_extra_token_as_related(self) -> None:
        left = parameter("rhythmic_lfo_phase_offset_ratio")
        right = parameter("rhythmic_lfo_phase_ratio")
        pair = {"cosine_similarity": 0.99, "token_jaccard": 0.8}

        decision, _, _ = corpus.classify_semantic_pair(pair, left, right, 0.90, 0.95)

        self.assertEqual("related", decision)

    def test_semantic_groups_create_derived_draft_without_mutating_input(self) -> None:
        left = parameter("transient_decay_time_ms", occurrences=1)
        right = parameter("transient_decay_ms", occurrences=2)
        left["unit"] = right["unit"] = "ms"
        triage = [{
            "left": left["technical_name"],
            "right": right["technical_name"],
            "effective_decision": "same",
            "auto_confidence": 0.98,
            "decision_source": "auto",
        }]

        groups, draft = corpus.build_semantic_groups([left, right], triage)

        self.assertEqual(1, len(groups))
        self.assertEqual("transient_decay_ms", groups[0]["canonical_name"])
        self.assertEqual(1, len(draft))
        self.assertNotIn("_semantic_group", right)


if __name__ == "__main__":
    unittest.main()
