"""Event and settings storage: in-memory for local runs and tests, DynamoDB in AWS."""

import threading
from datetime import datetime, timedelta, timezone
from typing import Protocol

from .config import get_settings
from .models import EventRecord, ResidentSettings
from .seeds import resident_settings as seeded_settings


class Store(Protocol):
    name: str

    def create_event(self, record: EventRecord) -> bool:
        """Insert only if the event id is new. Returns False for duplicates (Ring retries)."""
        ...

    def put_event(self, record: EventRecord) -> None: ...
    def get_event(self, event_id: str) -> EventRecord | None: ...
    def list_events(self, since: datetime | None = None, limit: int = 50) -> list[EventRecord]: ...
    def get_settings(self) -> ResidentSettings: ...
    def put_settings(self, settings: ResidentSettings) -> None: ...
    def reset(self) -> None: ...


def iso(dt: datetime) -> str:
    """Fixed-width UTC ISO string, so lexicographic order equals time order (DynamoDB sort key)."""
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds")


class MemoryStore:
    """Process-local store. Only for local runs and tests: Lambda instances do not share memory."""

    name = "memory"

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._events: dict[str, EventRecord] = {}
        self._settings = seeded_settings()

    def create_event(self, record: EventRecord) -> bool:
        with self._lock:
            if record.event.id in self._events:
                return False
            self._events[record.event.id] = record.model_copy(deep=True)
            return True

    def put_event(self, record: EventRecord) -> None:
        with self._lock:
            self._events[record.event.id] = record.model_copy(deep=True)

    def get_event(self, event_id: str) -> EventRecord | None:
        with self._lock:
            record = self._events.get(event_id)
            return record.model_copy(deep=True) if record else None

    def list_events(self, since: datetime | None = None, limit: int = 50) -> list[EventRecord]:
        with self._lock:
            records = [r.model_copy(deep=True) for r in self._events.values()]
        if since is not None:
            records = [r for r in records if r.updated_at > since]
        return sorted(records, key=lambda r: r.created_at, reverse=True)[:limit]

    def get_settings(self) -> ResidentSettings:
        with self._lock:
            return self._settings.model_copy(deep=True)

    def put_settings(self, settings: ResidentSettings) -> None:
        with self._lock:
            self._settings = settings.model_copy(deep=True)

    def reset(self) -> None:
        with self._lock:
            self._events.clear()
            self._settings = seeded_settings()


class DynamoStore:
    """Two tables (see template.yaml):
    events:   id (PK); GSI "by_updated" on (gsi_pk, updated_at); TTL on expires_at; record JSON in "doc".
    settings: id (PK) = "resident"; settings JSON in "doc".
    """

    name = "dynamodb"
    GSI = "by_updated"
    GSI_PK = "event"
    SETTINGS_ID = "resident"

    def __init__(self, events_table: str, settings_table: str, region: str):
        import boto3

        ddb = boto3.resource("dynamodb", region_name=region)
        self._events = ddb.Table(events_table)
        self._settings = ddb.Table(settings_table)

    def _item(self, record: EventRecord) -> dict:
        retention = timedelta(days=self.get_settings().retention_days)
        return {
            "id": record.event.id,
            "gsi_pk": self.GSI_PK,
            "created_at": iso(record.created_at),
            "updated_at": iso(record.updated_at),
            "expires_at": int((record.created_at + retention).timestamp()),
            "doc": record.model_dump_json(),
        }

    @staticmethod
    def _record(item: dict) -> EventRecord | None:
        if int(item.get("expires_at", 0)) and int(item["expires_at"]) < datetime.now(timezone.utc).timestamp():
            return None  # past retention; DynamoDB TTL deletion can lag, so hide it here too
        return EventRecord.model_validate_json(item["doc"])

    def create_event(self, record: EventRecord) -> bool:
        try:
            self._events.put_item(
                Item=self._item(record),
                ConditionExpression="attribute_not_exists(#id)",
                ExpressionAttributeNames={"#id": "id"},
            )
            return True
        except self._events.meta.client.exceptions.ConditionalCheckFailedException:
            return False

    def put_event(self, record: EventRecord) -> None:
        self._events.put_item(Item=self._item(record))

    def get_event(self, event_id: str) -> EventRecord | None:
        item = self._events.get_item(Key={"id": event_id}, ConsistentRead=True).get("Item")
        return self._record(item) if item else None

    def list_events(self, since: datetime | None = None, limit: int = 50) -> list[EventRecord]:
        from boto3.dynamodb.conditions import Key

        condition = Key("gsi_pk").eq(self.GSI_PK)
        if since is not None:
            condition = condition & Key("updated_at").gt(iso(since))
        items = self._events.query(
            IndexName=self.GSI, KeyConditionExpression=condition, ScanIndexForward=False, Limit=limit
        )["Items"]
        records = [r for r in map(self._record, items) if r is not None]
        return sorted(records, key=lambda r: r.created_at, reverse=True)

    def get_settings(self) -> ResidentSettings:
        item = self._settings.get_item(Key={"id": self.SETTINGS_ID}).get("Item")
        return ResidentSettings.model_validate_json(item["doc"]) if item else seeded_settings()

    def put_settings(self, settings: ResidentSettings) -> None:
        self._settings.put_item(Item={"id": self.SETTINGS_ID, "doc": settings.model_dump_json()})

    def reset(self) -> None:
        scan_kwargs = {"ProjectionExpression": "#id", "ExpressionAttributeNames": {"#id": "id"}}
        with self._events.batch_writer() as batch:
            while True:
                page = self._events.scan(**scan_kwargs)
                for item in page["Items"]:
                    batch.delete_item(Key={"id": item["id"]})
                if "LastEvaluatedKey" not in page:
                    break
                scan_kwargs["ExclusiveStartKey"] = page["LastEvaluatedKey"]
        self._settings.delete_item(Key={"id": self.SETTINGS_ID})


_store: Store | None = None


def get_store() -> Store:
    global _store
    if _store is None:
        s = get_settings()
        if s.store_backend == "memory":
            _store = MemoryStore()
        else:
            if not (s.events_table and s.settings_table):
                raise RuntimeError("STORE_BACKEND=dynamodb requires EVENTS_TABLE and SETTINGS_TABLE")
            _store = DynamoStore(s.events_table, s.settings_table, s.aws_region)
    return _store
