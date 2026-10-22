def test_health_is_public(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["store"] == "memory"
    assert body["ring_api_configured"] is False
    assert body["escalation_configured"] is False
    assert "server_time" in body


def test_routes_live_under_api_prefix(client):
    assert client.get("/health").status_code == 404


def test_private_routes_require_token(client, auth_headers):
    assert client.get("/api/auth/check").status_code == 401
    bad = {"Authorization": "Bearer wrong"}
    assert client.get("/api/auth/check", headers=bad).status_code == 401
    assert client.get("/api/auth/check", headers=auth_headers).json() == {"ok": True}


def test_local_cors_allows_next_dev_server(client):
    r = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
