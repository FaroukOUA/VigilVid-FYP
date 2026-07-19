import unittest

from app.hugging_face import normalize_gradio_output, parse_probability, parse_windows


class HuggingFaceNormalizationTests(unittest.TestCase):
    def test_parse_windows_handles_fractional_percent_values(self) -> None:
        text = "\n".join(
            [
                "  [0.0s - 6.4s]  ->  0.2% fake",
                "  [6.4s - 12.8s]  ->  0.3% fake",
                "  [12.8s - 19.2s]  ->  18.0% fake",
            ]
        )

        self.assertEqual(
            parse_windows(text),
            [
                {"startSec": 0.0, "endSec": 6.4, "fakeProbability": 0.002},
                {"startSec": 6.4, "endSec": 12.8, "fakeProbability": 0.003},
                {"startSec": 12.8, "endSec": 19.2, "fakeProbability": 0.18},
            ],
        )

    def test_parse_probability_handles_fractional_percent_values(self) -> None:
        self.assertAlmostEqual(parse_probability("0.9%") or 0, 0.009)
        self.assertAlmostEqual(parse_probability("87.3%") or 0, 0.873)
        self.assertAlmostEqual(parse_probability("0.873") or 0, 0.873)

    def test_normalize_gradio_output_uses_correct_percent_scale(self) -> None:
        raw_output = (
            "REAL",
            "1.0%",
            "\n".join(
                [
                    "Processing Time: 57.9s",
                    "Duration: 86.3s  |  Frames: 2589  |  Windows: 14",
                    "Aggregation: mean=1.9%  |  fake votes=0/14  |  peak=18.0%",
                    "",
                    "  [0.0s - 6.4s]  ->  0.2% fake",
                    "  [6.4s - 12.8s]  ->  0.3% fake",
                    "  [12.8s - 19.2s]  ->  0.1% fake",
                    "  [19.2s - 25.6s]  ->  0.5% fake",
                    "  [25.6s - 32.0s]  ->  0.5% fake",
                    "  [32.0s - 38.4s]  ->  0.8% fake",
                    "  [38.4s - 44.8s]  ->  3.2% fake",
                    "  [44.8s - 51.2s]  ->  0.2% fake",
                    "  [51.2s - 57.6s]  ->  0.6% fake",
                    "  [57.6s - 64.0s]  ->  0.0% fake",
                    "  [64.0s - 70.4s]  ->  2.3% fake",
                    "  [70.4s - 76.8s]  ->  0.2% fake",
                    "  [76.8s - 83.2s]  ->  0.1% fake",
                    "  [83.2s - 86.3s]  ->  18.0% fake  <- strongest window",
                ]
            ),
        )

        result = normalize_gradio_output(raw_output, fallback_processing_time=60.0)

        self.assertEqual(result.label, "real")
        self.assertEqual(result.confidence_percent, 1.0)
        self.assertEqual(result.windows[0]["fakeProbability"], 0.002)
        self.assertEqual(result.windows[5]["fakeProbability"], 0.008)
        self.assertEqual(result.windows[-1]["fakeProbability"], 0.18)
        self.assertIn("0 of 14 moments showed a stronger AI signal", result.explanation)


if __name__ == "__main__":
    unittest.main()
