import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

from stage7_acoustic_features import analyze_segment


class Stage7AcousticFeaturesTest(unittest.TestCase):
    def test_extracts_levels_spectral_stats_and_timeline_seconds(self):
        sample_rate = 16_000
        time = np.arange(sample_rate * 3) / sample_rate
        audio = (0.3 * np.sin(2 * np.pi * 220 * time)).astype(np.float32)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "tone.wav"
            sf.write(source, audio, sample_rate)
            result = analyze_segment(source, 0, 3)

        self.assertEqual(result["sample_rate_hz"], 16_000)
        self.assertGreater(result["peak"], 0.29)
        self.assertGreater(result["rms_mean"], 0.20)
        self.assertGreater(result["spectral_centroid_mean_hz"], 100)
        self.assertTrue(all(a <= b for a, b in zip(result["beat_times_seconds"], result["beat_times_seconds"][1:])))
        self.assertTrue(all(0 <= point <= 3 for point in result["onset_times_seconds"]))
        self.assertIn("formants", result)

    def test_silence_has_no_formant_estimates(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "silence.wav"
            sf.write(source, np.zeros(16_000, dtype=np.float32), 16_000)
            result = analyze_segment(source, 0, 1)
        self.assertIsNone(result["formants"])

    def test_noise_does_not_receive_formants_from_unvoiced_frames(self):
        sample_rate = 16_000
        rng = np.random.default_rng(7)
        audio = (0.2 * rng.normal(size=sample_rate * 2)).astype(np.float32)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "noise.wav"
            sf.write(source, audio, sample_rate)
            result = analyze_segment(source, 0, 2)
        self.assertIsNone(result["formants"])
        self.assertEqual(result["formant_skip_reason"], "insufficient_voiced_frames")

    def test_helm_negative_gate_suppresses_formants(self):
        sample_rate = 16_000
        time = np.arange(sample_rate) / sample_rate
        audio = (0.3 * np.sin(2 * np.pi * 120 * time)).astype(np.float32)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "voiced.wav"
            sf.write(source, audio, sample_rate)
            result = analyze_segment(source, 0, 1, helm_has_vocals=False)
        self.assertIsNone(result["formants"])

    def test_estimates_formants_for_harmonic_vowel_like_signal(self):
        sample_rate = 16_000
        time = np.arange(sample_rate * 2) / sample_rate
        source_signal = sum(np.sin(2 * np.pi * 120 * harmonic * time) / harmonic for harmonic in range(1, 80))
        # Resonators create a deterministic synthetic voiced signal with F1/F2-like peaks.
        audio = source_signal
        for center_hz, radius in ((500, 0.96), (1500, 0.96)):
            angle = 2 * np.pi * center_hz / sample_rate
            audio = lfilter([1 - radius], [1, -2 * radius * np.cos(angle), radius**2], audio)
        audio = (0.5 * audio / np.max(np.abs(audio))).astype(np.float32)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "vowel-like.wav"
            sf.write(source, audio, sample_rate)
            result = analyze_segment(source, 0, 2, helm_has_vocals=True)
        self.assertIsNotNone(result["formants"])
        self.assertGreater(result["formants"]["f1_hz"], 200)
        self.assertGreater(result["formants"]["f2_hz"], result["formants"]["f1_hz"])
        self.assertGreater(result["formants"]["confidence"], 0)


if __name__ == "__main__":
    unittest.main()
