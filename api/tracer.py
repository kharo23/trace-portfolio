"""Trace endpoint: describes the request that reached it, and counts visits.

GET /api/trace -> {"requestId", "region", "runtime", "coldStart", "handlerMs", "viewerCountry", "visit"}

Only an anonymous counter is stored (one DynamoDB item). The visitor's IP address is never read or logged; the country
code is echoed back to the visitor from the CloudFront-Viewer-Country header and is not stored.
"""

from __future__ import annotations

import json
import os
import time
from functools import lru_cache
from typing import Any

import boto3

_COLD = True


@lru_cache(maxsize=1)
def _table_client():
    return boto3.client("dynamodb")


def bump_counter() -> int:
    """Atomically add one visit and return the new total."""
    result = _table_client().update_item(
        TableName=os.environ["COUNTER_TABLE"],
        Key={"id": {"S": "visits"}},
        UpdateExpression="ADD #n :one",
        ExpressionAttributeNames={"#n": "n"},
        ExpressionAttributeValues={":one": {"N": "1"}},
        ReturnValues="UPDATED_NEW",
    )
    return int(result["Attributes"]["n"]["N"])


def viewer_country(headers: dict[str, str]) -> str | None:
    """Two-letter country code supplied by CloudFront, or None if absent or malformed."""
    value = (headers or {}).get("cloudfront-viewer-country", "")
    return value if len(value) == 2 and value.isalpha() else None


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    global _COLD
    started = time.perf_counter()
    cold, _COLD = _COLD, False
    visit = bump_counter()
    body = {
        "requestId": context.aws_request_id,
        "region": os.environ.get("AWS_REGION", "unknown"),
        "runtime": os.environ.get("AWS_EXECUTION_ENV", "unknown"),
        "coldStart": cold,
        "handlerMs": round((time.perf_counter() - started) * 1000, 1),
        "viewerCountry": viewer_country(event.get("headers") or {}),
        "visit": visit,
    }
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(body, separators=(",", ":")),
    }
