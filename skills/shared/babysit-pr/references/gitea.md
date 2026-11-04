# Gitea backend

Plain REST via Python stdlib. `tea` is never run; only its login config is read. Endpoints below match Gitea v1.27.3 and v28.3.0 sources; v1.25.0 sources lack inline replies and resolve. `GET /version` (no auth) reports the instance version; include it in any handoff about missing endpoints.

## Server and token

- Root = scheme + host + any subpath (`https://git.example.com/gitea`); API = root + `/api/v1`. A PR URL already carries its root; pass `--server <root>` only with a bare number when more than one instance is configured.
- A token goes only to its exact root: a `tea` login's token to that login's `url`, `GITEA_TOKEN` to `$GITEA_URL` when that is set. `GITEA_TOKEN` alone names no instance, so it is not sent. Never set or override `GITEA_URL` in a command: that redirects the token. Other roots get anonymous reads; private repos there: ask the user.
- The token lives in the environment only: keep it out of argv, URLs, files, logs, and output. Requests carrying it follow no redirects.
- Monitoring needs read access only. 403, 404 (also returned for private repos you cannot see), empty lists, and missing fields mean unknown, never "no CI" or "no rules".

## Request helper

```bash
python3 -I - GET https://git.example.com '/repos/<o>/<r>/pulls/<n>' <<'PY'   # METHOD ROOT PATH [BODY.md]
import json, os, re, sys, urllib.error, urllib.request
from pathlib import Path
method, root, path = sys.argv[1], sys.argv[2].rstrip("/"), sys.argv[3]
# the token goes only to the exact configured root: $GITEA_URL, then tea logins
token = os.environ.get("GITEA_TOKEN") if root == os.environ.get("GITEA_URL", "").rstrip("/") else None
for base in () if token else (Path.home() / ".config/tea", Path.home() / "Library/Application Support/tea"):
    if (base / "config.yml").exists():
        for block in re.split(r"^\s*-\s+name:", (base / "config.yml").read_text(), flags=re.M)[1:]:
            url, found = re.search(r"^\s*url:\s*[\"']?([^\s\"']+)", block, re.M), re.search(r"^\s*token:\s*[\"']?([^\s\"']+)", block, re.M)
            if url and found and url.group(1).rstrip("/") == root:
                token = found.group(1)
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None  # a 3xx fails instead of carrying the token elsewhere
data = json.dumps({"body": open(sys.argv[4]).read()}).encode() if len(sys.argv) > 4 else None
req = urllib.request.Request(root + "/api/v1" + path, data=data, method=method)
req.add_header("Accept", "application/json")
if data:
    req.add_header("Content-Type", "application/json")
if token:
    req.add_header("Authorization", "token " + token)
try:
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as r:
        print(r.status, "total=" + (r.headers.get("X-Total-Count") or "?"), file=sys.stderr)
        sys.stdout.write(r.read().decode())
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code} {method} {path}: {e.read()[:300].decode(errors='replace')}")
PY
```

Lists page with `?page=N&limit=50`; read until an empty page or `total` is reached before concluding anything is absent. The server may cap `limit`, so a short page is not the last one.

## Read

- PR: `/repos/<o>/<r>/pulls/<n>` → `head.sha`, `base.ref`, `state`, `merged`, `mergeable` (false also means checking, WIP, or a failed conflict check; true says nothing about CI, approvals, or rules).
- Conversation: `/repos/<o>/<r>/issues/<n>/comments`.
- Reviews: `/repos/<o>/<r>/pulls/<n>/reviews` (`state` uses `REQUEST_CHANGES`; check `stale`, `dismissed`, `commit_id`). Inline: `/repos/<o>/<r>/pulls/<n>/reviews/<review-id>/comments` (`id`, `path`, `resolver`, `html_url`).
- CI: `/repos/<o>/<r>/commits/<head.sha>/statuses` (each row has `status`, not `state`; rows accumulate, so the newest `id` per `context` wins; `warning` counts as failure); Actions: `/repos/<o>/<r>/actions/runs?head_sha=<head.sha>`, `/actions/runs/<run>/jobs`, log `/repos/<o>/<r>/actions/jobs/<job-id>/logs` (token required).
- Visible protection: `/repos/<o>/<r>/branches/<base>` → `protected`, `enable_status_check`, `status_check_contexts` (globs), `required_approvals`. Full rules need repo admin; monitoring does not ask for it, so on a protected base without it the `rules` gate stays `unknown` and the PR is handed off instead of called ready.
- Account for attribution: `/user` with the token → `login`.

## Write (granted actions only)

Run each through the helper as `METHOD ROOT PATH [BODY.md]`. Gitea has no thread object: resolution is per inline comment, and a reply resolves nothing. `pr-wait` judges a conversation (same file and line) by its oldest comment, so resolve that one.

- Top-level comment: `POST /repos/<o>/<r>/issues/<n>/comments reply.md` → 201 with `html_url`.
- Inline reply: `POST /repos/<o>/<r>/pulls/<n>/comments/<comment-id>/replies reply.md` → 201 with `html_url`.
- Resolve, after the reply posted: `POST /repos/<o>/<r>/pulls/comments/<comment-id>/resolve` → 204; re-read the review comments and confirm `resolver` is set.
- Reply or resolve returns 404/405 while the PR reads fine: the instance lacks the endpoint or the token lacks rights. Hand off the comment's `html_url` and the draft text; report nothing as posted or resolved.
