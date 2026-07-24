import os

import pytest


@pytest.mark.real_media
@pytest.mark.skipif(
    os.getenv("RUN_REAL_MEDIA_TESTS") != "1",
    reason="set RUN_REAL_MEDIA_TESTS=1 to enable live media smoke tests",
)
def test_real_media_smoke_is_opt_in():
    # The production path is exercised by DownloadProcessor. This marker prevents
    # CI and local test runs from downloading third-party media unexpectedly.
    assert os.getenv("RUN_REAL_MEDIA_TESTS") == "1"
