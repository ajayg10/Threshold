import os

# Set before the app is imported so tests never depend on a developer's .env.
os.environ.update(
    {
        "APP_ENV": "local",
        "DEMO_TOKEN": "test-token-0123456789abcdef",
        "STORE_BACKEND": "memory",
        "DISPATCH_MODE": "inline",
        "HARNESS_HMAC_KEY": "test-harness-key-0123456789",
        "RING_HMAC_KEY": "test-ring-key-0123456789",
        "RING_ACCESS_TOKEN": "",
        "RING_REFRESH_TOKEN": "",
        "RING_CLIENT_ID": "",
        "RING_CLIENT_SECRET": "",
        "AWS_DEFAULT_REGION": "us-east-1",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.store import get_store  # noqa: E402

TOKEN = os.environ["DEMO_TOKEN"]
HARNESS_KEY = os.environ["HARNESS_HMAC_KEY"]
RING_KEY = os.environ["RING_HMAC_KEY"]


@pytest.fixture(autouse=True)
def clean_store():
    get_store().reset()
    yield
    get_store().reset()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {TOKEN}"}
