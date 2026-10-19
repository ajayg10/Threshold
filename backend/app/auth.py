"""Demo auth: one shared bearer token from DEMO_TOKEN. This is not production auth."""

import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

_bearer = HTTPBearer(auto_error=False)


def require_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    expected = get_settings().demo_token
    if not expected:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "DEMO_TOKEN is not configured")
    if creds is None or not secrets.compare_digest(creds.credentials, expected):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Missing or invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
