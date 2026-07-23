# Link QR Generator

Generate PNG QR codes for web links from the command line.

## Setup

From the `QR-generator` directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
```

## Usage

Pass a link directly:

```bash
python3 main.py https://example.com
```

Or run the script without a link and paste one when prompted:

```bash
python3 main.py
```

By default, the QR code is saved as `qrs/<domain>-<id>-qr.png`. The short ID keeps links from the same domain from overwriting one another.

### Choose the output file

```bash
python3 main.py https://example.com --output my-qr.png
```

### Change the colors

```bash
python3 main.py https://example.com \
  --fill "#172554" \
  --background "#eff6ff"
```

Use high-contrast colors and scan the finished QR code before sharing it. Dark foregrounds on light backgrounds are the most reliable.

Run `python3 main.py --help` to see every option.
