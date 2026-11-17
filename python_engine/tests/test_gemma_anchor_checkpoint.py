from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "anchoring_v3" / "build_anchors.py"
SPEC = importlib.util.spec_from_file_location("gemma_anchor_builder", SCRIPT)
assert SPEC and SPEC.loader
anchors = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(anchors)


class FakeClient:
    model = "embeddinggemma-2:740m"
    endpoint = "http://localhost:11434"
    dim = 2

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[1.0, 0.0] for _ in texts]

    def embed(self, text: str) -> list[float]:
        return self.embed_batch([text])[0]


class GemmaAnchorCheckpointTests(unittest.TestCase):
    def test_reuses_saved_anchor_texts_only_for_matching_operation_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp) / "checkpoint"
            client = FakeClient()
            first = anchors.CheckpointOllamaClient(client, directory, "identity-a")
            self.assertEqual([[1.0, 0.0]], first.embed_batch(["axis prompt"]))
            self.assertEqual(1, len(client.calls))

            resumed_client = FakeClient()
            resumed = anchors.CheckpointOllamaClient(resumed_client, directory, "identity-a")
            resumed.embed_batch(["axis prompt", "another prompt"])
            self.assertEqual([["another prompt"]], resumed_client.calls)
            with self.assertRaisesRegex(RuntimeError, "does not match"):
                anchors.CheckpointOllamaClient(FakeClient(), directory, "identity-b")


if __name__ == "__main__":
    unittest.main()
