from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SUPABASE_TIMEOUT_SEC = 8.0
PUBLIC_GAME_SESSION_LIMIT = 250
PUBLIC_INSIGHTS_SUMMARY_LIMIT = 180


def persist_detection_result(
    *,
    detection_id: str,
    user_id: str | None,
    source_type: str,
    result: dict[str, object],
    file_name: str | None,
    content_type: str | None,
    file_size_bytes: int | None,
    has_url: bool,
) -> bool:
    """Persist signed-in history summaries only."""
    if not is_supabase_persistence_enabled() or not user_id:
        return False

    history_payload = {
        "detection_id": detection_id,
        "user_id": user_id,
        "source_type": source_type,
        "label": result["label"],
        "ai_probability": result["aiProbability"],
        "confidence_percent": result["confidencePercent"],
        "processing_time_sec": result.get("processingTimeSec"),
        "video_duration_sec": result.get("videoDurationSec"),
        "retained_for_research": False,
        "save_to_history": True,
        "metadata": {
            "content_type": content_type,
            "file_size_bytes": file_size_bytes,
            "has_url_input": has_url,
            "original_file_extension": get_file_extension(file_name),
            "window_count": len(result.get("windows", []))
            if isinstance(result.get("windows"), list)
            else 0,
        },
    }

    history_rows = post_supabase_rows(
        "detection_history",
        history_payload,
        params={"on_conflict": "detection_id"},
        prefer="resolution=merge-duplicates,return=representation",
    )
    if not history_rows:
        return False

    history_id = history_rows[0].get("id")
    if not isinstance(history_id, str):
        logger.warning("Supabase detection history response did not include an id")
        return False

    window_rows = build_window_rows(history_id, result.get("windows"))
    if window_rows:
        post_supabase_rows(
            "detection_windows",
            window_rows,
            params={"on_conflict": "detection_history_id,window_index"},
            prefer="resolution=merge-duplicates,return=minimal",
        )

    return True


def persist_game_score(
    *,
    user_id: str,
    mode: str,
    score: int,
    correct_count: int,
    total_rounds: int,
    best_streak: int,
    round_ids: list[str],
) -> bool:
    if not is_supabase_persistence_enabled():
        return False

    accuracy = correct_count / total_rounds if total_rounds > 0 else 0.0
    response = post_supabase_rows(
        "game_sessions",
        {
            "user_id": user_id,
            "mode": mode,
            "score": score,
            "correct_count": correct_count,
            "total_rounds": total_rounds,
            "accuracy": round(accuracy, 5),
            "best_streak": best_streak,
            "metadata": {
                "round_ids": normalize_metadata_texts(round_ids, limit=50),
            },
        },
        prefer="return=minimal",
    )
    return response is not None


def get_authenticated_user_id(access_token: str | None) -> str | None:
    if not access_token or not is_supabase_persistence_enabled():
        return None

    supabase_url = get_supabase_url()
    service_role_key = get_supabase_service_role_key()
    if not supabase_url or not service_role_key:
        return None

    headers = {
        "apikey": service_role_key,
        "Authorization": f"Bearer {access_token}",
    }

    try:
        with httpx.Client(timeout=SUPABASE_TIMEOUT_SEC) as client:
            response = client.get(f"{supabase_url}/auth/v1/user", headers=headers)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Supabase auth user lookup failed with status %s",
            exc.response.status_code,
        )
        return None
    except httpx.HTTPError as exc:
        logger.warning("Supabase auth user lookup failed: %s", exc)
        return None

    try:
        data = response.json()
    except ValueError:
        logger.warning("Supabase auth user lookup returned non-JSON data")
        return None

    if not isinstance(data, dict):
        return None

    user_id = data.get("id")
    return user_id if isinstance(user_id, str) and user_id else None


def get_detection_history(user_id: str, limit: int = 50) -> list[dict[str, Any]]:
    if not is_supabase_persistence_enabled():
        return []

    rows = get_supabase_rows(
        "detection_history",
        params={
            "user_id": f"eq.{user_id}",
            "save_to_history": "eq.true",
            "select": (
                "detection_id,source_type,label,ai_probability,"
                "confidence_percent,processing_time_sec,video_duration_sec,"
                "retained_for_research,save_to_history,created_at"
            ),
            "order": "created_at.desc",
            "limit": str(max(1, min(limit, 100))),
        },
    )
    return rows or []


def get_public_insights() -> dict[str, Any]:
    """Return privacy-safe aggregate values for the public website dashboard."""
    if not is_supabase_persistence_enabled():
        return build_public_insights_response(
            source="not_configured",
            game_rows=[],
            game_summary_rows=[],
            detection_summary_rows=[],
        )

    game_rows = get_supabase_rows(
        "game_sessions",
        params={
            "select": (
                "mode,score,correct_count,total_rounds,accuracy,best_streak,"
                "created_at"
            ),
            "order": "created_at.desc",
            "limit": str(PUBLIC_GAME_SESSION_LIMIT),
        },
    )
    game_summary_rows = get_supabase_rows(
        "insights_game_summary",
        params={
            "select": (
                "day,mode,session_count,average_score,average_accuracy,"
                "highest_score"
            ),
            "order": "day.desc",
            "limit": str(PUBLIC_INSIGHTS_SUMMARY_LIMIT),
        },
    )
    detection_summary_rows = get_supabase_rows(
        "insights_detection_summary",
        params={
            "select": (
                "day,source_type,label,detection_count,"
                "research_contribution_count,average_ai_probability"
            ),
            "order": "day.desc",
            "limit": str(PUBLIC_INSIGHTS_SUMMARY_LIMIT),
        },
    )

    if (
        game_rows is None
        and game_summary_rows is None
        and detection_summary_rows is None
    ):
        return build_public_insights_response(
            source="unavailable",
            game_rows=[],
            game_summary_rows=[],
            detection_summary_rows=[],
        )

    return build_public_insights_response(
        source="supabase",
        game_rows=game_rows or [],
        game_summary_rows=game_summary_rows or [],
        detection_summary_rows=detection_summary_rows or [],
    )


def build_public_insights_response(
    *,
    source: str,
    game_rows: list[dict[str, Any]],
    game_summary_rows: list[dict[str, Any]],
    detection_summary_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "source": source,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "game": build_public_game_insights(game_rows, game_summary_rows),
        "detection": build_public_detection_insights(detection_summary_rows),
        "privacy": {
            "aggregateOnly": True,
            "userIdentifiersReturned": False,
            "rawRoundMetadataReturned": False,
        },
    }


def build_public_game_insights(
    game_rows: list[dict[str, Any]],
    game_summary_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    recent_sessions = [
        build_public_game_session(row)
        for row in game_rows
        if row.get("mode") == "solo"
    ]
    summary_rows = [
        build_public_game_summary_row(row)
        for row in game_summary_rows
        if row.get("mode") == "solo"
    ]

    total_correct = sum(item["correctCount"] for item in recent_sessions)
    total_rounds = sum(item["totalRounds"] for item in recent_sessions)
    recent_best_score = max(
        (item["score"] for item in recent_sessions),
        default=0,
    )
    best_streak = max(
        (item["bestStreak"] for item in recent_sessions),
        default=0,
    )
    summary_session_count = sum(row["sessionCount"] for row in summary_rows)
    summary_best_score = max(
        (row["highestScore"] for row in summary_rows),
        default=0,
    )
    summary_weighted_accuracy = weighted_average(
        (
            (row["averageAccuracy"], row["sessionCount"])
            for row in summary_rows
            if row["sessionCount"] > 0
        ),
    )

    if summary_weighted_accuracy is not None:
        average_accuracy = summary_weighted_accuracy
    elif total_rounds > 0:
        average_accuracy = total_correct / total_rounds
    else:
        average_accuracy = 0.0

    return {
        "sessionCount": summary_session_count or len(recent_sessions),
        "averageAccuracy": round(clamp_probability(average_accuracy), 5),
        "totalCorrect": total_correct,
        "totalRounds": total_rounds,
        "bestScore": max(summary_best_score, recent_best_score),
        "bestStreak": best_streak,
        "recentSessions": recent_sessions[:50],
        "daily": summary_rows,
    }


def build_public_game_session(row: dict[str, Any]) -> dict[str, Any]:
    total_rounds = max(0, to_int(row.get("total_rounds")))
    correct_count = min(max(0, to_int(row.get("correct_count"))), total_rounds)
    accuracy = to_float(row.get("accuracy"))
    if accuracy is None and total_rounds > 0:
        accuracy = correct_count / total_rounds

    return {
        "mode": "solo",
        "score": max(0, to_int(row.get("score"))),
        "correctCount": correct_count,
        "totalRounds": total_rounds,
        "accuracy": round(clamp_probability(accuracy or 0.0), 5),
        "bestStreak": max(0, to_int(row.get("best_streak"))),
        "createdAt": to_string(row.get("created_at")),
    }


def build_public_game_summary_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "day": to_string(row.get("day")),
        "mode": "solo",
        "sessionCount": max(0, to_int(row.get("session_count"))),
        "averageScore": round(to_float(row.get("average_score")) or 0.0, 2),
        "averageAccuracy": round(
            clamp_probability(to_float(row.get("average_accuracy")) or 0.0),
            5,
        ),
        "highestScore": max(0, to_int(row.get("highest_score"))),
    }


def build_public_detection_insights(
    detection_summary_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    rows = [
        build_public_detection_summary_row(row)
        for row in detection_summary_rows
    ]
    detection_count = sum(row["detectionCount"] for row in rows)
    research_contribution_count = sum(
        row["researchContributionCount"]
        for row in rows
    )
    average_ai_probability = weighted_average(
        (
            (row["averageAiProbability"], row["detectionCount"])
            for row in rows
            if row["detectionCount"] > 0
        ),
    )

    return {
        "detectionCount": detection_count,
        "researchContributionCount": research_contribution_count,
        "averageAiProbability": round(
            clamp_probability(average_ai_probability or 0.0),
            5,
        ),
        "byLabel": sum_counts_by_key(rows, "label", "detectionCount"),
        "bySourceType": sum_counts_by_key(rows, "sourceType", "detectionCount"),
        "daily": rows,
    }


def build_public_detection_summary_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "day": to_string(row.get("day")),
        "sourceType": to_string(row.get("source_type")),
        "label": to_string(row.get("label")),
        "detectionCount": max(0, to_int(row.get("detection_count"))),
        "researchContributionCount": max(
            0,
            to_int(row.get("research_contribution_count")),
        ),
        "averageAiProbability": round(
            clamp_probability(to_float(row.get("average_ai_probability")) or 0.0),
            5,
        ),
    }


def weighted_average(values: object) -> float | None:
    numerator = 0.0
    denominator = 0
    for value, weight in values:
        if weight <= 0:
            continue
        numerator += value * weight
        denominator += weight

    return None if denominator == 0 else numerator / denominator


def sum_counts_by_key(
    rows: list[dict[str, Any]],
    key: str,
    count_key: str,
) -> dict[str, int]:
    totals: dict[str, int] = {}
    for row in rows:
        label = str(row.get(key) or "").strip()
        if not label:
            continue
        totals[label] = totals.get(label, 0) + to_int(row.get(count_key))

    return totals


def is_supabase_persistence_enabled() -> bool:
    enabled = os.getenv("SUPABASE_PERSISTENCE_ENABLED", "false").strip().lower()
    if enabled not in {"1", "true", "yes", "on"}:
        return False

    return bool(get_supabase_url() and get_supabase_service_role_key())


def post_supabase_rows(
    table_name: str,
    payload: dict[str, Any] | list[dict[str, Any]],
    *,
    params: dict[str, str] | None = None,
    prefer: str,
) -> list[dict[str, Any]] | None:
    supabase_url = get_supabase_url()
    service_role_key = get_supabase_service_role_key()
    if not supabase_url or not service_role_key:
        return None

    url = f"{supabase_url}/rest/v1/{table_name}"
    headers = build_supabase_admin_headers(
        service_role_key,
        {
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )

    try:
        with httpx.Client(timeout=SUPABASE_TIMEOUT_SEC) as client:
            response = client.post(url, headers=headers, params=params, json=payload)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Supabase persistence failed for %s with status %s",
            table_name,
            exc.response.status_code,
        )
        return None
    except httpx.HTTPError as exc:
        logger.warning("Supabase persistence failed for %s: %s", table_name, exc)
        return None

    if not response.content:
        return []

    try:
        data = response.json()
    except ValueError:
        logger.warning("Supabase persistence returned non-JSON data for %s", table_name)
        return []

    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return [data]

    return []


def get_supabase_rows(
    table_name: str,
    *,
    params: dict[str, str],
) -> list[dict[str, Any]] | None:
    supabase_url = get_supabase_url()
    service_role_key = get_supabase_service_role_key()
    if not supabase_url or not service_role_key:
        return None

    url = f"{supabase_url}/rest/v1/{table_name}"
    headers = build_supabase_admin_headers(service_role_key)

    try:
        with httpx.Client(timeout=SUPABASE_TIMEOUT_SEC) as client:
            response = client.get(url, headers=headers, params=params)
            response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Supabase read failed for %s with status %s",
            table_name,
            exc.response.status_code,
        )
        return None
    except httpx.HTTPError as exc:
        logger.warning("Supabase read failed for %s: %s", table_name, exc)
        return None

    try:
        data = response.json()
    except ValueError:
        logger.warning("Supabase read returned non-JSON data for %s", table_name)
        return []

    return data if isinstance(data, list) else []


def build_supabase_admin_headers(
    service_role_key: str,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    headers = {"apikey": service_role_key}
    if not service_role_key.startswith("sb_secret_"):
        headers["Authorization"] = f"Bearer {service_role_key}"

    if extra_headers:
        headers.update(extra_headers)

    return headers


def build_window_rows(
    history_id: str,
    windows: object,
) -> list[dict[str, object]]:
    if not isinstance(windows, list):
        return []

    rows: list[dict[str, object]] = []
    for index, window in enumerate(windows):
        if not isinstance(window, dict):
            continue

        start_sec = to_float(window.get("startSec"))
        end_sec = to_float(window.get("endSec"))
        fake_probability = to_float(window.get("fakeProbability"))
        if start_sec is None or end_sec is None or fake_probability is None:
            continue

        rows.append(
            {
                "detection_history_id": history_id,
                "window_index": index,
                "start_sec": start_sec,
                "end_sec": end_sec,
                "fake_probability": fake_probability,
            }
        )

    return rows


def get_supabase_url() -> str:
    return os.getenv("SUPABASE_URL", "").strip().rstrip("/")


def get_supabase_service_role_key() -> str:
    return os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()


def get_file_extension(file_name: str | None) -> str | None:
    if not file_name or "." not in file_name:
        return None

    suffix = file_name.rsplit(".", 1)[-1].strip().lower()
    if not suffix:
        return None

    return f".{suffix[:12]}"


def normalize_metadata_texts(values: list[str], *, limit: int) -> list[str]:
    normalized_values: list[str] = []
    for value in values[:limit]:
        normalized = value.strip()
        if normalized:
            normalized_values.append(normalized[:128])

    return normalized_values


def to_string(value: object) -> str:
    return value if isinstance(value, str) else ""


def to_int(value: object) -> int:
    number = to_float(value)
    if number is None:
        return 0

    return int(number)


def clamp_probability(value: float) -> float:
    if not math.isfinite(value):
        return 0.0

    return min(1.0, max(0.0, value))


def to_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None

    if isinstance(value, int | float):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value)
        except ValueError:
            return None
    else:
        return None

    if not math.isfinite(number):
        return None

    return number
