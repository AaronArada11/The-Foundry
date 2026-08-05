import io

from aaron_toolkit.app import app
from fastapi.testclient import TestClient
from PIL import Image


def test_health_and_tool_catalog():
    with TestClient(app) as client:
        assert client.get("/api/health").json()["status"] == "online"
        tools = client.get("/api/tools").json()

    assert [tool["id"] for tool in tools] == [
        "youtube-downloader",
        "tiktok-downloader",
        "link-qr-generator",
        "image-format-converter",
        "pdf-to-word",
        "schedule-comparator",
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


def test_tiktok_download_endpoint_rejects_unsafe_url_before_queueing():
    with TestClient(app) as client:
        response = client.post(
            "/api/tiktok-download-jobs",
            json={
                "url": "http://127.0.0.1/private",
                "format": "mp4",
                "turnstileToken": "dev-bypass",
                "permissionConfirmed": True,
            },
        )

    assert response.status_code == 422
    assert "TikTok" in response.json()["detail"]


def test_image_endpoint_returns_downloadable_conversion():
    source = io.BytesIO()
    Image.new("RGBA", (10, 6), (255, 0, 0, 128)).save(source, format="PNG")

    with TestClient(app) as client:
        response = client.post(
            "/api/image-conversions",
            files={"file": ("sample.png", source.getvalue(), "image/png")},
            data={"format": "jpg", "quality": "80", "background": "#FFFFFF"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/jpeg"
    assert response.headers["x-artifact-filename"] == "sample.jpg"
    assert response.content.startswith(b"\xff\xd8\xff")


def test_pdf_endpoint_queues_valid_document():
    source = io.BytesIO()
    document = __import__("pymupdf").open()
    page = document.new_page()
    page.insert_text((72, 72), "Editable document")
    document.save(source)
    document.close()

    with TestClient(app) as client:
        response = client.post(
            "/api/pdf-to-word-jobs",
            files={"file": ("document.pdf", source.getvalue(), "application/pdf")},
            data={"turnstileToken": "dev-bypass"},
        )

    assert response.status_code == 202
    payload = response.json()
    assert payload["kind"] == "pdf-to-word"
    assert payload["status"] == "queued"
    assert payload["eventsUrl"].endswith("/events")
