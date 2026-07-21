import time
import unittest
from pathlib import Path
from unittest.mock import patch

from app.main import DetectionCreateRequest, build_preview_detection_job
from app.video_preview import VideoPreview


class DetectionPreviewJobTests(unittest.TestCase):
    def test_preview_detection_queues_without_preparing_segment(self) -> None:
        preview = VideoPreview(
            preview_id="src_test",
            source_type="url",
            original_url="https://example.com/video.mp4",
            file_path=Path("video.mp4"),
            file_size_bytes=1024,
            content_type="video/mp4",
            duration_sec=30.0,
            width=640,
            height=360,
            thumbnail_strip_path=None,
            created_at=time.monotonic(),
        )
        request = DetectionCreateRequest.model_validate(
            {
                "previewId": "src_test",
                "sourceType": "url",
                "trimStartSec": 0,
                "trimEndSec": 12,
            },
        )

        with (
            patch("app.main.get_video_preview", return_value=preview),
            patch("app.main.create_analysis_segment") as create_segment,
        ):
            job = build_preview_detection_job(
                request,
                "det_test",
                None,
                "https://api.example.com",
            )

        create_segment.assert_not_called()
        self.assertEqual(job.preview_id, "src_test")
        self.assertIsNone(job.file_path)
        self.assertEqual(job.progress_message, "Preparing video")


if __name__ == "__main__":
    unittest.main()
