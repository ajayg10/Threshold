"""Hands an accepted event to the pipeline worker without blocking the webhook response."""

import json
import logging
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from .config import get_settings

log = logging.getLogger(__name__)
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="threshold-worker")


@lru_cache
def _lambda_client():
    import boto3

    return boto3.client("lambda", region_name=get_settings().aws_region)


def dispatch(event_id: str) -> None:
    from .worker import process_event

    settings = get_settings()
    if settings.dispatch_mode == "inline":
        process_event(event_id)
    elif settings.dispatch_mode == "thread":
        _executor.submit(process_event, event_id)
    else:
        if not settings.worker_function_name:
            raise RuntimeError("DISPATCH_MODE=lambda requires WORKER_FUNCTION_NAME")
        _lambda_client().invoke(
            FunctionName=settings.worker_function_name,
            InvocationType="Event",  # async: returns 202 immediately
            Payload=json.dumps({"task": "process_event", "event_id": event_id}).encode(),
        )
