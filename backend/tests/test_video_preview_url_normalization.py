import unittest

from app.video_preview import normalize_submitted_video_url


class VideoPreviewUrlNormalizationTests(unittest.TestCase):
    def test_instagram_share_token_is_removed(self) -> None:
        self.assertEqual(
            normalize_submitted_video_url(
                "https://www.instagram.com/reel/DZYG4klu4Dk/?igsh=MXVvbW9rbnlmYTdpOQ==",
            ),
            "https://www.instagram.com/reel/DZYG4klu4Dk/",
        )

    def test_tracking_params_are_removed_but_signed_params_are_kept(self) -> None:
        self.assertEqual(
            normalize_submitted_video_url(
                "https://cdn.example.com/video.mp4?Expires=123&Signature=abc&utm_source=share",
            ),
            "https://cdn.example.com/video.mp4?Expires=123&Signature=abc",
        )

    def test_youtube_watch_keeps_video_id_only(self) -> None:
        self.assertEqual(
            normalize_submitted_video_url(
                "https://www.youtube.com/watch?v=abc123&si=tracker&utm_source=share",
            ),
            "https://www.youtube.com/watch?v=abc123",
        )

    def test_tiktok_tracking_query_is_removed(self) -> None:
        self.assertEqual(
            normalize_submitted_video_url(
                "https://www.tiktok.com/@user/video/123?is_from_webapp=1&utm_campaign=x",
            ),
            "https://www.tiktok.com/@user/video/123/",
        )


if __name__ == "__main__":
    unittest.main()
