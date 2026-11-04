import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))
import tracer  # noqa: E402


def context(request_id="req-1"):
    return SimpleNamespace(aws_request_id=request_id)


def test_viewer_country_accepts_two_letters_only():
    assert tracer.viewer_country({"cloudfront-viewer-country": "IT"}) == "IT"
    assert tracer.viewer_country({"cloudfront-viewer-country": "ITA"}) is None
    assert tracer.viewer_country({"cloudfront-viewer-country": "1T"}) is None
    assert tracer.viewer_country({}) is None


def test_handler_reports_request_and_counter(monkeypatch):
    monkeypatch.setattr(tracer, "_COLD", True)
    with mock.patch.object(tracer, "bump_counter", return_value=42):
        first = tracer.handler({"headers": {"cloudfront-viewer-country": "IT"}}, context("a"))
        second = tracer.handler({"headers": {}}, context("b"))
    one, two = json.loads(first["body"]), json.loads(second["body"])
    assert one["requestId"] == "a" and one["visit"] == 42 and one["coldStart"] is True
    assert one["viewerCountry"] == "IT"
    assert two["requestId"] == "b" and two["coldStart"] is False and two["viewerCountry"] is None
    assert first["headers"]["cache-control"] == "no-store"


def test_handler_never_exposes_the_ip(monkeypatch):
    with mock.patch.object(tracer, "bump_counter", return_value=1):
        out = tracer.handler(
            {"headers": {"x-forwarded-for": "203.0.113.9"}, "requestContext": {"http": {"sourceIp": "203.0.113.9"}}},
            context(),
        )
    assert "203.0.113.9" not in out["body"]
