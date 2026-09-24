import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_db

init_db()
client = TestClient(app)

def test_health_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "Yahoo Finance" in data["market_data_provider"]
    assert "DISABLED" in data["order_placement"]

def test_market_status_endpoint():
    response = client.get("/api/market/status")
    assert response.status_code == 200
    data = response.json()
    assert "is_open" in data
    assert "status" in data
    assert "Asia/Kolkata" in data["timezone"]

def test_universe_endpoint():
    response = client.get("/api/universe")
    assert response.status_code == 200
    data = response.json()
    assert data["stocks_selected"] == 200
    assert len(data["universe"]) == 200
    first = data["universe"][0]
    assert "symbol" in first
    assert "company" in first
    assert "yfinance_symbol" in first
    assert first["yfinance_symbol"].endswith(".NS")

def test_scanner_status_endpoint():
    response = client.get("/api/scanner/status")
    assert response.status_code == 200
    data = response.json()
    assert "is_running" in data
    assert "stage" in data
    assert "stocks_selected" in data

def test_scanner_progress_endpoint():
    response = client.get("/api/scanner/progress")
    assert response.status_code == 200
    data = response.json()
    assert "is_running" in data
    assert "stage" in data
    assert "progress_pct" in data

def test_scanner_results_endpoint():
    response = client.get("/api/scanner/results")
    assert response.status_code == 200
    data = response.json()
    assert "results" in data
    assert "count" in data
    assert "disclaimer" in data
    assert "no orders are placed automatically" in data["disclaimer"]

def test_scanner_run_mocked(monkeypatch):
    import backend.main
    async def mock_execute(timeframe=None, risk_reward=None, volume_multiplier=None):
        pass
    monkeypatch.setattr(backend.main, "execute_scanner", mock_execute)

    response = client.post("/api/scanner/run", json={
        "timeframe": "10m",
        "risk_reward": 2.0,
        "volume_multiplier": 1.5
    })
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "RUNNING"
    assert data["timeframe"] == "10m"

def test_scanner_stop_endpoint():
    response = client.post("/api/scanner/stop")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
