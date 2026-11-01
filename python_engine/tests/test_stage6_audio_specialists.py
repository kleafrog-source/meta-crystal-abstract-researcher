import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from stage6_audio_specialists import LANGUAGE_CODES, language_for_label, load_segment, normalized_label


class Stage6AudioSpecialistsTest(unittest.TestCase):
    def test_load_segment_crops_and_resamples_to_mono_16khz(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.wav"
            sf.write(source, np.zeros((96_000, 2), dtype=np.float32), 48_000)

            result = load_segment(source, offset=0.5, duration=1.25)

        self.assertEqual(result.dtype, np.float32)
        self.assertEqual(len(result), 20_000)

    def test_invalid_short_windows_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source.wav"
            sf.write(source, np.zeros(24_000, dtype=np.float32), 16_000)

            with self.assertRaisesRegex(ValueError, "at least 0.25 seconds"):
                load_segment(source, offset=0, duration=0.1)

    def test_vakgyata_labels_have_iso_language_codes(self):
        self.assertEqual(LANGUAGE_CODES["hindi"], ("hi-IN", "Hindi"))
        self.assertEqual(language_for_label("hi-IN"), ("hi-IN", "Hindi"))
        self.assertEqual(normalized_label("LABEL_0"), "0")


if __name__ == "__main__":
    unittest.main()
