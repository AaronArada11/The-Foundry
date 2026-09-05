from aaron_toolkit.manifests import load_tool_manifests


def test_tool_manifests_are_unique_ordered_and_available():
    manifests = load_tool_manifests()

    assert [manifest.id for manifest in manifests] == [
        "youtube-downloader",
        "tiktok-downloader",
        "link-qr-generator",
        "image-format-converter",
        "pdf-to-word",
    ]
    assert len({manifest.slug for manifest in manifests}) == len(manifests)
    assert all(manifest.availability == "available" for manifest in manifests)


def test_manifest_wire_shape_uses_public_aliases():
    manifest = load_tool_manifests()[0].model_dump(by_alias=True)

    assert manifest["executionType"] == "server-job"
    assert manifest["sortOrder"] == 1
    assert "execution_type" not in manifest
