from yt_dlp import YoutubeDL

def download_mp4(url):
    options = {
        "format": "bestvideo+bestaudio/best",
        "merge_output_format": "mp4",
        "outtmpl": "downloads/%(title)s.%(ext)s",
    }

    with YoutubeDL(options) as ydl:
        ydl.download([url])


def download_mp3(url):
    options = {
        "format": "bestaudio/best",
        "outtmpl": "downloads/%(title)s.%(ext)s",
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ],
    }

    with YoutubeDL(options) as ydl:
        ydl.download([url])


def download_mov(url):
    options = {
        "format": "bestvideo+bestaudio/best",
        "outtmpl": "downloads/%(title)s.%(ext)s",
        "postprocessors": [
            {
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mov",  # yt-dlp uses this spelling
            }
        ],
    }

    with YoutubeDL(options) as ydl:
        ydl.download([url])


def menu():
    print("=" * 40)
    print("      YouTube Downloader")
    print("=" * 40)
    print("1. Download as MP4")
    print("2. Download as MP3")
    print("3. Download as MOV")
    print("4. Exit")


while True:
    menu()

    choice = input("\nChoose an option: ")

    match choice:
        case "1":
            url = input("\nEnter YouTube URL: ")
            download_mp4(url)
            print("\nMP4 download complete!\n")

        case "2":
            url = input("\nEnter YouTube URL: ")
            download_mp3(url)
            print("\nMP3 download complete!\n")

        case "3":
            url = input("\nEnter YouTube URL: ")
            download_mov(url)
            print("\nMOV download complete!\n")

        case "4":
            print("Goodbye!")
            break

        case _:
            print("\nInvalid option.\n")