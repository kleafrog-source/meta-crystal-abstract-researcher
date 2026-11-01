import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from stage8_acoustic_window_sources import analyze_window_sources


class Stage8AcousticWindowSourcesTest(unittest.TestCase):
    def test_reads_selected_range_once_and_splits_into_stage7_sized_windows(self):
        sample_rate = 16_000
        duration = 32.0
        time = np.arange(int(sample_rate * duration)) / sample_rate
        audio = (0.25 * np.sin(2 * np.pi * 440 * time)).astype(np.float32)
        offset = 1.0
        selected_duration = 30.75
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "tone.wav"
            sf.write(source, audio, sample_rate)
            windows = analyze_window_sources(source, offset, selected_duration)

        self.assertEqual([window["offset"] for window in windows], [offset, offset + 30.0])
        self.assertEqual([window["duration"] for window in windows], [30.0, 0.75])
        for window in windows:
            features = window["acoustic_features"]
            self.assertEqual(features["feature_version"], "stage7_librosa_lpc_v1")
            self.assertEqual(features["sample_rate_hz"], 16_000)
            self.assertIsInstance(features["beat_times_seconds"], list)
            self.assertIsInstance(features["onset_times_seconds"], list)
            self.assertNotIn("formants", features)
            self.assertTrue(all(0 <= value <= window["duration"] for value in features["beat_times_seconds"]))


if __name__ == "__main__":
    unittest.main()
