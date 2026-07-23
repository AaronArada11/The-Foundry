# YouTube Downloader

A small command-line tool for downloading YouTube videos as MP4, MP3, or MOV files with [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Requirements

- Python 3.10 or newer
- [FFmpeg](https://ffmpeg.org/) available on your `PATH`

On macOS, you can install FFmpeg with Homebrew:

```bash
brew install ffmpeg
```

## Setup

From the `yt-downloader` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

## Usage

Run the downloader:

```bash
python3 main.py
```

Choose an output format, paste a YouTube URL, and wait for the download to finish. Files are saved in the `downloads/` directory.

| Option | Output |
| --- | --- |
| MP4 | Video with audio |
| MP3 | Audio at up to 320 kbps |
| MOV | Video converted to QuickTime MOV |

Press `4` in the menu to exit.

## Troubleshooting

- **`ModuleNotFoundError: No module named 'yt_dlp'`** — activate the virtual environment and install the requirements again.
- **FFmpeg or post-processing error** — confirm that `ffmpeg -version` works in your terminal.
- **A download stops working** — update yt-dlp with `python3 -m pip install --upgrade yt-dlp`.

Only download content you have permission to use, and follow YouTube's terms and applicable copyright laws.
