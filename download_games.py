#!/usr/bin/env python3
"""
download_games.py — recursively download all local game assets from the
celestial GitHub Pages archive into the local repo.

Usage:
    python download_games.py

Requirements:
    pip install requests beautifulsoup4

The script reads assets/json/books.json and assets/json/tools.json,
finds all entries with source="local", then crawls each game's folder
from the archive site, saving files to assets/src/ (stripping the
/celestialisbest/ prefix the GitHub Pages host adds).
"""

import json
import re
import time
import urllib.parse
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run:  pip install requests beautifulsoup4")
    raise

# Archive mirror — GitHub Pages host for the celestial source
BASE_URL    = "https://celestialdevsalot.github.io/celestialisbest"
BASE_NETLOC = "celestialdevsalot.github.io"
# The GitHub Pages path prefix that every URL on this host has
BASE_PREFIX = "/celestialisbest"

REPO_ROOT = Path(__file__).parent

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; celestial-downloader/1.0)",
    "Referer":    BASE_URL + "/",
})

# Track everything we've already fetched so we don't loop
visited: set[str] = set()

# File extensions we parse for more linked resources
PARSEABLE_EXTS = {".html", ".htm", ".js", ".mjs", ".css", ".json"}


def url_to_local(url: str) -> Path | None:
    """
    Map an archive URL to a local repo path.
    Strips the /celestialisbest prefix so that
    https://...github.io/celestialisbest/assets/src/fnaf/1/index.html
    → REPO_ROOT/assets/src/fnaf/1/index.html
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.netloc and parsed.netloc != BASE_NETLOC:
        return None  # external — skip
    path = parsed.path
    if path.startswith(BASE_PREFIX):
        path = path[len(BASE_PREFIX):]
    path = path.lstrip("/")
    if not path:
        return None
    return REPO_ROOT / path


def fetch(url: str, retries: int = 3) -> "requests.Response | None":
    """Fetch URL with retry + back-off. Returns None on permanent failure."""
    for attempt in range(retries):
        try:
            r = SESSION.get(url, timeout=30)
            if r.status_code == 200:
                return r
            if r.status_code in (404, 403, 410):
                print(f"  [SKIP {r.status_code}] {url}")
                return None
            print(f"  [WARN {r.status_code}] {url}  (attempt {attempt + 1}/{retries})")
        except requests.RequestException as e:
            print(f"  [ERR]  {url}  {e}  (attempt {attempt + 1}/{retries})")
        if attempt < retries - 1:
            time.sleep(2 ** attempt)
    return None


def save(local: Path, data: bytes) -> None:
    local.parent.mkdir(parents=True, exist_ok=True)
    local.write_bytes(data)


def extract_urls(content: str, base_url: str, ext: str) -> list:
    """Pull linked asset URLs out of HTML / CSS / JS source."""
    urls = []

    if ext in (".html", ".htm"):
        soup = BeautifulSoup(content, "html.parser")
        for tag in soup.find_all(True):
            for attr in ("src", "href", "data-src", "data-url", "action"):
                val = tag.get(attr)
                if val and not val.startswith(("data:", "javascript:", "#", "blob:")):
                    urls.append(urllib.parse.urljoin(base_url, val))
        for style in soup.find_all("style"):
            urls.extend(extract_urls(style.get_text(), base_url, ".css"))
        for script in soup.find_all("script"):
            text = script.get_text()
            if text:
                urls.extend(extract_urls(text, base_url, ".js"))

    elif ext == ".css":
        for m in re.finditer(r'url\(\s*["\']?([^)\'"]+)["\']?\s*\)', content):
            val = m.group(1).strip()
            if not val.startswith("data:"):
                urls.append(urllib.parse.urljoin(base_url, val))
        for m in re.finditer(r'@import\s+["\']([^"\']+)["\']', content):
            urls.append(urllib.parse.urljoin(base_url, m.group(1)))

    elif ext in (".js", ".mjs"):
        for m in re.finditer(r'''(?:import|from)\s+["'`]([^"'`]+)["'`]''', content):
            val = m.group(1)
            if not val.startswith(("http://", "https://", "data:", "blob:")):
                urls.append(urllib.parse.urljoin(base_url, val))
        for m in re.finditer(r'''(?:fetch|Worker|import)\(\s*["'`]([^"'`]+)["'`]''', content):
            val = m.group(1)
            if val.startswith(("/", ".", "assets")):
                urls.append(urllib.parse.urljoin(base_url, val))

    return urls


def crawl(url: str) -> None:
    """Download url and recursively download all linked same-origin assets."""
    url = url.split("#")[0].strip()
    if not url or url in visited:
        return
    visited.add(url)

    parsed = urllib.parse.urlparse(url)
    if parsed.netloc and parsed.netloc != BASE_NETLOC:
        return  # external — don't follow

    local = url_to_local(url)
    if local is None:
        return

    # Resume: skip files we already have, but still parse them for links
    if local.exists():
        print(f"  [EXIST] {url}")
        ext = local.suffix.lower()
        if ext in PARSEABLE_EXTS:
            try:
                content = local.read_text(encoding="utf-8", errors="replace")
                for linked in extract_urls(content, url, ext):
                    crawl(linked)
            except Exception:
                pass
        return

    print(f"  [GET]   {url}")
    r = fetch(url)
    if r is None:
        return

    save(local, r.content)

    ext = local.suffix.lower()
    if ext not in PARSEABLE_EXTS:
        return

    content = r.content.decode("utf-8", errors="replace")
    for linked in extract_urls(content, url, ext):
        crawl(linked)


def local_paths_from_json(json_path: Path) -> list:
    """Return all /assets/src/... and /assets/img/... paths from a JSON file."""
    data = json.loads(json_path.read_text(encoding="utf-8"))
    paths = []
    for entry in data:
        if entry.get("source") == "local":
            url = entry.get("url", "")
            path = url.split("#")[0].split("?")[0]
            if path.startswith("/assets/"):
                paths.append(path)
    return paths


def main():
    print("=" * 60)
    print("celestial game asset downloader")
    print(f"source : {BASE_URL}")
    print(f"dest   : {REPO_ROOT}")
    print("=" * 60)

    all_paths: set = set()

    for json_file in [
        REPO_ROOT / "assets" / "json" / "books.json",
        REPO_ROOT / "assets" / "json" / "tools.json",
    ]:
        if json_file.exists():
            found = local_paths_from_json(json_file)
            print(f"\n{json_file.name}: {len(found)} local entries")
            all_paths.update(found)

    if not all_paths:
        print("No local entries found — nothing to download.")
        return

    print(f"\nTotal unique local paths: {len(all_paths)}")
    print("Starting crawl...\n")

    for path in sorted(all_paths):
        # Build the archive URL with the /celestialisbest prefix
        url = BASE_URL + path
        print(f"\n>>> {path}")
        crawl(url)

    # Also crawl the flash SWF wrapper (shared by many flash games)
    print("\n>>> /assets/src/flash/ (shared flash wrapper)")
    crawl(BASE_URL + "/assets/src/flash/index.html")

    # Grab game thumbnails referenced in books.json
    print("\n>>> game thumbnails")
    books_path = REPO_ROOT / "assets" / "json" / "books.json"
    if books_path.exists():
        books = json.loads(books_path.read_text(encoding="utf-8"))
        for entry in books:
            img = entry.get("img", "")
            if img.startswith("/assets/img/"):
                local = url_to_local(BASE_URL + img)
                if local and not local.exists():
                    url = BASE_URL + img
                    if url not in visited:
                        visited.add(url)
                        print(f"  [GET]   {url}")
                        r = fetch(url)
                        if r:
                            save(local, r.content)

    print(f"\n{'=' * 60}")
    print(f"Done. Fetched / verified {len(visited)} URLs.")
    print("=" * 60)


if __name__ == "__main__":
    main()
