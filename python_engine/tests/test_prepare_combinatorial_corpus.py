import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


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
        "quantity_kind": "amount",
        "_collection": {"occurrence_count": occurrences},
    }


class CorpusPreparationTests(unittest.TestCase):
    def test_prepare_only_writes_readback_verified_inputs_without_embedding(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "snapshot.json"
            output = root / "prepared"
            source.write_text(json.dumps([parameter("stereo_width")]), encoding="utf-8")
            with patch.object(sys, "argv", ["prepare", "--input", str(source), "--output-dir", str(output), "--prepare-only"]):
                with patch.object(corpus, "embed_batch", side_effect=AssertionError("prepare must not call an embedding model")):
                    self.assertEqual(0, corpus.main())
            manifest = corpus.verify_prepare_manifest(output)
            self.assertEqual("prepared", manifest["status"])
            self.assertFalse((output / "semantic_embeddings.f32").exists())

    def test_semantic_vectors_resume_from_last_saved_batch_after_failure(self) -> None:
        items = [parameter("stereo_width"), parameter("stereo_depth"), parameter("stereo_balance")]
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir)
            calls = 0

            def interrupted(_endpoint: str, _model: str, texts: list[str]) -> list[list[float]]:
                nonlocal calls
                calls += 1
                if calls == 2:
                    raise RuntimeError("simulated interruption")
                return [[3.0, 4.0] for _ in texts]

            with patch.object(corpus, "embed_batch", side_effect=interrupted):
                with self.assertRaisesRegex(RuntimeError, "simulated interruption"):
                    corpus.load_or_create_embeddings(items, output, "http://localhost:11434", "test-model", 1)

            partial_meta = json.loads((output / "semantic_embeddings_meta.json").read_text(encoding="utf-8"))
            self.assertEqual("vectorizing", partial_meta["status"])
            self.assertEqual(1, partial_meta["completed_count"])
            first_vector_bytes = (output / "semantic_embeddings.f32").read_bytes()[8:]

            resumed_calls: list[list[str]] = []
            with patch.object(corpus, "embed_batch", side_effect=lambda _e, _m, texts: resumed_calls.append(texts) or [[0.0, 1.0] for _ in texts]):
                vectors, metadata = corpus.load_or_create_embeddings(items, output, "http://localhost:11434", "test-model", 1)

            self.assertEqual(2, sum(len(batch) for batch in resumed_calls))
            self.assertEqual(3, len(vectors))
            self.assertEqual(first_vector_bytes, (output / "semantic_embeddings.f32").read_bytes()[8:16])
            self.assertEqual("complete", metadata["status"])
            self.assertEqual(3, metadata["completed_count"])

    def test_embedding_cache_key_includes_endpoint_and_text_configuration(self) -> None:
        items = [parameter("stereo_width")]
        self.assertNotEqual(
            corpus.cache_key(items, "qwen3-embedding:0.6b", "http://localhost:11434"),
            corpus.cache_key(items, "qwen3-embedding:0.6b", "http://other-host:11434"),
        )

    def test_embedding_cache_is_reused_only_when_full_key_matches(self) -> None:
        items = [parameter("stereo_width")]
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            source = root / "source"
            target = root / "target"
            with patch.object(corpus, "embed_batch", return_value=[[3.0, 4.0]]) as embed:
                vectors, metadata = corpus.load_or_create_embeddings(
                    items, source, "http://localhost:11434", "test-model", 8,
                )
                embed.assert_called_once()

            with patch.object(corpus, "embed_batch", side_effect=AssertionError("matching cache should avoid recomputation")):
                reused, reused_metadata = corpus.load_or_create_embeddings(
                    items, target, "http://localhost:11434", "test-model", 8, reuse_from=source,
                )

            self.assertEqual(corpus.read_embedding_cache(source / "semantic_embeddings.f32"), reused)
            self.assertEqual(metadata["cache_key"], reused_metadata["cache_key"])

            changed = [{**items[0], "description_en": "different embedding input"}]
            with patch.object(corpus, "embed_batch", return_value=[[0.0, 2.0]]) as embed:
                recomputed, changed_metadata = corpus.load_or_create_embeddings(
                    changed, root / "changed", "http://localhost:11434", "test-model", 8, reuse_from=source,
                )
                embed.assert_called_once()
            self.assertNotEqual(metadata["cache_key"], changed_metadata["cache_key"])
            self.assertNotEqual(reused, recomputed)

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

    def test_auto_triage_keeps_structural_alias_with_different_quantity_kind_as_related(self) -> None:
        left = parameter("analog_current_decay_rate")
        right = parameter("analog_current_decay_speed")
        left["unit"] = "decay_rate"
        right["unit"] = "decay_speed"
        left["quantity_kind"] = "decay_rate"
        right["quantity_kind"] = "decay_speed"
        pair = {"cosine_similarity": 0.98, "token_jaccard": 0.6}

        decision, confidence, reasons = corpus.classify_semantic_pair(pair, left, right, 0.90, 0.95)

        self.assertEqual("related", decision)
        self.assertGreater(confidence, 0.8)
        self.assertTrue(any("different quantity_kind" in reason for reason in reasons))

    def test_identical_shape_with_equal_quantity_kind_can_be_same(self) -> None:
        left = parameter("transient_decay_time_ms")
        right = parameter("transient_decay_ms")
        left["quantity_kind"] = right["quantity_kind"] = "duration"
        left["unit"] = right["unit"] = "ms"
        pair = {"cosine_similarity": 0.98, "token_jaccard": 0.8}

        decision, _, _ = corpus.classify_semantic_pair(pair, left, right, 0.90, 0.95)

        self.assertEqual("same", decision)

    def test_missing_quantity_kind_cannot_be_classified_as_same(self) -> None:
        left = parameter("transient_decay_time_ms")
        right = parameter("transient_decay_ms")
        left.pop("quantity_kind")
        right.pop("quantity_kind")
        left["unit"] = right["unit"] = "ms"
        pair = {"cosine_similarity": 0.98, "token_jaccard": 0.8}

        decision, _, reasons = corpus.classify_semantic_pair(pair, left, right, 0.90, 0.95)

        self.assertEqual("related", decision)
        self.assertTrue(any("missing or invalid quantity_kind" in reason for reason in reasons))

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
        left["quantity_kind"] = right["quantity_kind"] = "duration"
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
