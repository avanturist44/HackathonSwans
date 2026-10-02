#!/usr/bin/env python3
"""
Read-only Clio Manage (US) puller for the Swans hackathon. Standard library only.

Setup (once):
  1. Create an app at https://developers.clio.com/apps/new
     - Redirect URI: http://127.0.0.1:8765/callback
     - Permissions: READ-ONLY for everything you need
  2. cp .env.example .env   and paste the app key and secret into it

Usage (from the repo root):
  python3 backend/clio_pull.py auth              # browser login, saves .clio_token.json
  python3 backend/clio_pull.py pull              # pulls the Sapini matter into data/sapini/
  python3 backend/clio_pull.py pull --matter Sapini --download-docs

Only GET requests hit the Clio API (plus the OAuth token endpoint), so nothing in
Clio is ever written. .env, .clio_token.json and data/ are git-ignored.
"""
import argparse
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # repo root


def load_dotenv(path):
    """Minimal .env reader: KEY=VALUE lines; real environment variables win."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        if value:
            os.environ.setdefault(key.strip(), value)


load_dotenv(ROOT / ".env")

BASE = os.environ.get("CLIO_BASE", "https://app.clio.com")  # US instance
API = f"{BASE}/api/v4"
CLIENT_ID = os.environ.get("CLIO_CLIENT_ID")
CLIENT_SECRET = os.environ.get("CLIO_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("CLIO_REDIRECT_URI", "http://127.0.0.1:8765/callback")
TOKEN_FILE = Path(os.environ.get("CLIO_TOKEN_FILE", ROOT / ".clio_token.json"))
DATA_DIR = ROOT / "data"

# name, endpoint, extra filters, full field list, minimal fallback field list
RESOURCES = [
    ("notes", "notes.json", {"type": "Matter"},
     "id,etag,subject,detail,date,type,created_at,updated_at,author{name}",
     "id,subject,detail,date,created_at"),
    ("communications", "communications.json", {},
     "id,etag,subject,body,date,type,created_at,updated_at,senders{name},receivers{name}",
     "id,subject,body,date,type"),
    ("tasks", "tasks.json", {},
     "id,etag,name,description,status,priority,due_at,completed_at,created_at,updated_at,assignee{name}",
     "id,name,description,status,due_at"),
    ("calendar_entries", "calendar_entries.json", {},
     "id,etag,summary,description,start_at,end_at,all_day,location,created_at,updated_at",
     "id,summary,start_at,end_at"),
    ("documents", "documents.json", {},
     "id,etag,name,content_type,size,created_at,updated_at,parent{name},document_category{name}",
     "id,name,content_type,created_at,updated_at"),
    ("activities", "activities.json", {},  # time + expense entries ("how much has the firm spent")
     "id,etag,type,date,quantity,price,total,note,created_at,updated_at,user{name}",
     "id,type,date,total,note"),
    ("relationships", "relationships.json", {},  # providers, insurers, other parties
     "id,description,contact{id,name,type,primary_email_address,primary_phone_number}",
     "id,description,contact{id,name}"),
]

MATTER_FIELDS = ("id,etag,display_number,description,status,open_date,close_date,"
                 "practice_area{name},client{id,name},responsible_attorney{name},"
                 "custom_field_values{id,field_name,value},created_at,updated_at")
MATTER_FIELDS_MIN = "id,display_number,description,status,client{id,name}"


# ---------- OAuth ----------

def need_creds():
    if not CLIENT_ID or not CLIENT_SECRET:
        sys.exit("Missing CLIO_CLIENT_ID / CLIO_CLIENT_SECRET. Copy .env.example to .env and fill them in "
                 "(values from https://developers.clio.com/apps).")
    if CLIENT_ID.strip().isdigit():
        sys.exit("CLIO_CLIENT_ID looks like the numeric App ID. Clio wants the app's Key instead: "
                 "open your app at https://developers.clio.com/apps and copy the Key into .env.")


def post_form(url, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Token request failed: {e.code} {e.read().decode(errors='replace')}")


def save_token(tok):
    tok["expires_at"] = time.time() + int(tok.get("expires_in", 0)) - 60
    TOKEN_FILE.write_text(json.dumps(tok, indent=2))
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except OSError:
        pass


def load_token():
    if not TOKEN_FILE.exists():
        sys.exit("No token yet. Run: python3 backend/clio_pull.py auth")
    tok = json.loads(TOKEN_FILE.read_text())
    if time.time() >= tok.get("expires_at", 0) and tok.get("refresh_token"):
        need_creds()
        new = post_form(f"{BASE}/oauth/token", {
            "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
            "grant_type": "refresh_token", "refresh_token": tok["refresh_token"]})
        new.setdefault("refresh_token", tok["refresh_token"])
        save_token(new)
        tok = new
    return tok["access_token"]


def auth():
    need_creds()
    state = secrets.token_urlsafe(16)
    url = f"{BASE}/oauth/authorize?" + urllib.parse.urlencode({
        "response_type": "code", "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI, "state": state})
    redirect = urllib.parse.urlparse(REDIRECT_URI)
    port = int(os.environ.get("CLIO_LISTEN_PORT", redirect.port or 8765))
    result = {}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != redirect.path:
                self.send_response(404)
                self.end_headers()
                return
            result.update({k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()})
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Clio connected. You can close this tab.")

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", port), Handler)
    print("Opening Clio login in your browser. If it doesn't open, visit:\n" + url)
    webbrowser.open(url)
    while "code" not in result and "error" not in result:
        server.handle_request()
    server.server_close()

    if "error" in result:
        sys.exit(f"Authorization denied: {result}")
    if result.get("state") != state:
        sys.exit("OAuth state mismatch; aborting.")
    tok = post_form(f"{BASE}/oauth/token", {
        "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
        "grant_type": "authorization_code", "code": result["code"],
        "redirect_uri": REDIRECT_URI})
    save_token(tok)
    print(f"Saved token to {TOKEN_FILE} (valid ~30 days, auto-refreshes). Keep it out of git.")


# ---------- Read-only API calls ----------

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


_no_redirect = urllib.request.build_opener(_NoRedirect)


def api_get(token, path_or_url, params=None):
    url = path_or_url if path_or_url.startswith("http") else f"{API}/{path_or_url}"
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    while True:
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {token}", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get("Retry-After", "10"))
                print(f"  rate limited, waiting {wait}s")
                time.sleep(wait)
                continue
            raise


def get_all(token, path, params, fields):
    rows, url, query = [], path, dict(params, fields=fields, limit=200)
    while url:
        page = api_get(token, url, query)
        rows.extend(page.get("data") or [])
        url = ((page.get("meta") or {}).get("paging") or {}).get("next")
        query = None  # the "next" URL already carries the query string
    return rows


def fetch(token, name, path, params, fields, fallback):
    try:
        return get_all(token, path, params, fields)
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:300]
        if e.code in (400, 422) and fallback:
            print(f"  {name}: field list rejected ({e.code}: {body}); retrying with minimal fields")
            return get_all(token, path, params, fallback)
        if e.code == 403:
            print(f"  {name}: 403 forbidden. Enable READ permission for it in your Clio app, then re-run auth.")
            return []
        raise


def find_matter(token, query):
    matches = fetch(token, "matters", "matters.json", {"query": query}, MATTER_FIELDS, MATTER_FIELDS_MIN)
    if not matches:
        sys.exit(f"No matter matching '{query}'. Check the Swans setup app finished loading it.")
    if len(matches) > 1:
        print("Several matters matched; using the first:", [m.get("display_number") for m in matches])
    return matches[0]


def download_docs(token, docs, outdir):
    folder = outdir / "documents"
    folder.mkdir(exist_ok=True)
    for doc in docs:
        req = urllib.request.Request(f"{API}/documents/{doc['id']}/download.json",
                                     headers={"Authorization": f"Bearer {token}"})
        try:
            with _no_redirect.open(req, timeout=120) as r:
                data = r.read()
        except urllib.error.HTTPError as e:
            location = e.headers.get("Location") if e.code in (301, 302, 303, 307, 308) else None
            if not location:
                print(f"  could not download {doc.get('name')}: HTTP {e.code}")
                continue
            # Follow the redirect WITHOUT the Clio bearer token (signed storage URL).
            with urllib.request.urlopen(urllib.parse.urljoin(API, location), timeout=120) as r2:
                data = r2.read()
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", doc.get("name") or str(doc["id"]))
        (folder / f"{doc['id']}_{safe}").write_bytes(data)
        print(f"  downloaded {doc.get('name')} ({len(data)} bytes)")


def pull(matter_query, download):
    token = load_token()
    matter = find_matter(token, matter_query)
    matter_id = matter["id"]
    slug = re.sub(r"[^a-z0-9]+", "-", matter_query.lower()).strip("-") or str(matter_id)
    outdir = DATA_DIR / slug
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "matter.json").write_text(json.dumps(matter, indent=2))
    print(f"Matter {matter.get('display_number')} (id {matter_id})")

    for name, path, extra, full, minimal in RESOURCES:
        rows = fetch(token, name, path, dict(extra, matter_id=matter_id), full, minimal)
        (outdir / f"{name}.json").write_text(json.dumps(rows, indent=2))
        print(f"  {name}: {len(rows)}")

    if download:
        docs = json.loads((outdir / "documents.json").read_text())
        download_docs(token, docs, outdir)
    print(f"Done -> {outdir}/")


def main():
    parser = argparse.ArgumentParser(description="Read-only Clio Manage puller")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("auth", help="log in to Clio and save a token")
    p = sub.add_parser("pull", help="pull one matter's data to data/<matter>/")
    p.add_argument("--matter", default="Sapini")
    p.add_argument("--download-docs", action="store_true", help="also download document files")
    args = parser.parse_args()
    if args.cmd == "auth":
        auth()
    else:
        pull(args.matter, args.download_docs)


if __name__ == "__main__":
    main()
