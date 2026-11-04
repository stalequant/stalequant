"""Upload generated delisting JSON files to GitHub.

Uses a GitHub PAT from ``STALEQUANT_GITHUB_PAT`` and does not use local git credentials.

Example:
    python github_push_hl_delisting_data.py
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request
from urllib.request import urlopen

from src.config import HIP3_OUTPUT_PATH
from src.config import SCORING_OUTPUT_PATH


API_ROOT = "https://api.github.com"
OWNER = "stalequant"
REPO = "stalequant"
DEFAULT_UPLOADS = (
    (
        SCORING_OUTPUT_PATH,
        "delisting_new/hl_delisting_data.json",
    ),
    (
        HIP3_OUTPUT_PATH,
        "delisting_new/hip3_data.json",
    ),
)


def github_token() -> str | None:
    """Return the GitHub upload token from the process environment."""
    return os.environ.get("STALEQUANT_GITHUB_PAT") or None


def github_request(
    method: str,
    url: str,
    token: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method=method,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "hl-delisting-data-uploader",
            "X-GitHub-Api-Version": "2022-11-28",
        },
    )
    try:
        with urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub API {method} {url} failed: {exc.code} {details}") from exc
    return json.loads(raw) if raw else {}


def existing_file_sha(owner: str, repo: str, target: str, branch: str, token: str) -> str | None:
    url = f"{API_ROOT}/repos/{owner}/{repo}/contents/{target}?ref={branch}"
    try:
        data = github_request("GET", url, token)
    except RuntimeError as exc:
        if "failed: 404" in str(exc):
            return None
        raise
    sha = data.get("sha")
    return sha if isinstance(sha, str) else None


def upload_file(*, args: argparse.Namespace, source: Path, target: str, token: str | None) -> None:
    source = source.resolve()
    if not source.is_file():
        raise SystemExit(f"Source file does not exist: {source}")

    content = base64.b64encode(source.read_bytes()).decode("ascii")
    sha = None if args.dry_run else existing_file_sha(OWNER, REPO, target, args.branch, token or "")
    payload: dict[str, Any] = {
        "message": args.message,
        "content": content,
        "branch": args.branch,
    }
    if sha is not None:
        payload["sha"] = sha

    action = "UPDATE" if sha else "CREATE"
    if args.dry_run:
        print(f"DRY UPLOAD: {source} -> {OWNER}/{REPO}:{args.branch}/{target}")
        return

    if not token:
        raise SystemExit("Missing GitHub token: set STALEQUANT_GITHUB_PAT")

    url = f"{API_ROOT}/repos/{OWNER}/{REPO}/contents/{target}"
    github_request("PUT", url, token, payload)
    print(f"{action}: {source} -> {OWNER}/{REPO}:{args.branch}/{target}")


def upload_files(args: argparse.Namespace) -> None:
    if (args.source is None) != (args.target is None):
        raise SystemExit("--source and --target must be provided together for a single-file override.")

    uploads = (
        ((args.source, args.target),)
        if args.source is not None and args.target is not None
        else DEFAULT_UPLOADS
    )
    token = github_token()
    if not token and not args.dry_run:
        raise SystemExit("Missing GitHub token: set STALEQUANT_GITHUB_PAT")

    for source, target in uploads:
        upload_file(args=args, source=source, target=target, token=token)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch", default="main", help="Target branch. Default: main.")
    parser.add_argument(
        "--source",
        type=Path,
        default=None,
        help="Optional local file override. If provided, --target is also required.",
    )
    parser.add_argument(
        "--target",
        default=None,
        help="Optional repo path override. If provided, --source is also required.",
    )
    parser.add_argument("--message", default="Update delisting data", help="Commit message.")
    parser.add_argument("--dry-run", action="store_true", help="Print action without uploading.")
    return parser.parse_args()


def main() -> None:
    upload_files(parse_args())


if __name__ == "__main__":
    main()
