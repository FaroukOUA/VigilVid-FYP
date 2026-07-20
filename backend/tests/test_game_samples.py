import unittest

from app import game_samples


def make_sample(sample_id: str) -> game_samples.GameSample:
    return game_samples.GameSample(
        correct_answer="real",
        difficulty="Warmup",
        duration_sec=12,
        id=sample_id,
        model_ai_probability=0.0,
        model_answer="real",
        signal_notes=[],
        video_path=f"videos/test/real/{sample_id}.mp4",
    )


class GameSampleFilterTests(unittest.TestCase):
    def test_verified_clip_pool_is_loaded(self) -> None:
        self.assertGreaterEqual(len(game_samples.GAME_CLIP_VERIFIED_IDS), 60)

    def test_default_filter_excludes_unverified_clips(self) -> None:
        self.assertFalse(
            game_samples.should_include_game_sample(make_sample("vv_not_verified")),
        )

    def test_default_filter_includes_verified_clips(self) -> None:
        verified_id = next(iter(game_samples.GAME_CLIP_VERIFIED_IDS))

        self.assertTrue(
            game_samples.should_include_game_sample(make_sample(verified_id)),
        )


if __name__ == "__main__":
    unittest.main()
