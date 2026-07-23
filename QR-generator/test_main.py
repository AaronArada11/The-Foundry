import argparse
import tempfile
import unittest
from pathlib import Path

from main import default_output_path, generate_qr, png_output_path, valid_link


class LinkValidationTests(unittest.TestCase):
    def test_accepts_https_link(self):
        self.assertEqual(valid_link(" https://example.com/page "), "https://example.com/page")

    def test_rejects_link_without_http_scheme(self):
        with self.assertRaises(argparse.ArgumentTypeError):
            valid_link("example.com")


class OutputPathTests(unittest.TestCase):
    def test_builds_output_name_from_domain(self):
        output = default_output_path("https://www.example.com/page")

        self.assertEqual(output.parent, Path("qrs"))
        self.assertTrue(output.name.startswith("www.example.com-"))
        self.assertTrue(output.name.endswith("-qr.png"))

    def test_different_links_get_different_output_names(self):
        first = default_output_path("https://example.com/first")
        second = default_output_path("https://example.com/second")

        self.assertNotEqual(first, second)

    def test_adds_png_extension(self):
        self.assertEqual(png_output_path("custom-code"), Path("custom-code.png"))


class GenerationTests(unittest.TestCase):
    def test_writes_png_file(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "code.png"
            saved = generate_qr("https://example.com", output)

            self.assertEqual(saved, output)
            self.assertTrue(output.is_file())
            self.assertEqual(output.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")


if __name__ == "__main__":
    unittest.main()
