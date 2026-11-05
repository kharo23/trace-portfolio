"""Hermetic test environment: the DynamoDB client is created at import, so fake credentials and a region are set."""

import os

os.environ.setdefault("AWS_DEFAULT_REGION", "eu-central-1")
os.environ["AWS_ACCESS_KEY_ID"] = "test"
os.environ["AWS_SECRET_ACCESS_KEY"] = "test"
os.environ.pop("AWS_PROFILE", None)
