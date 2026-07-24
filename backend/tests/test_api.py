from aaron_toolkit.app import app
from fastapi.testclient import TestClient


def test_health_and_tool_catalog():
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "online"
        tools = client.get("/api/tools").json()

    assert [tool["id"] for tool in tools] == [
        "youtube-downloader",
        "link-qr-generator",
    ]


def test_qr_endpoint_returns_downloadable_png():
    with TestClient(app) as client:
        response = client.post(
            "/api/qr-codes",
            json={
                "link": "https://example.com",
                "foreground": "#1A3C2B",
                "background": "#FFFFFF",
                "filename": "example",
            },
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert response.headers["x-artifact-filename"] == "example-qr.png"


def test_download_endpoint_rejects_unsafe_url_before_queueing():
    with TestClient(app) as client:
        response = client.post(
            "/api/download-jobs",
            json={
                "url": "http://127.0.0.1/private",
                "format": "mp4",
                "turnstileToken": "dev-bypass",
                "permissionConfirmed": True,
            },
        )

    assert response.status_code == 422
    assert "YouTube" in response.json()["detail"]
