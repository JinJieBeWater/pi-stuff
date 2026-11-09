# Gitea backend

Plain REST via Python stdlib. `tea` is never run; only its login config is read. The request helper and token rules follow `babysit-pr`'s Gitea reference, except that a write body here is a complete JSON file.

## Server and token

- Root = scheme + host + any subpath (`https://git.example.com/gitea`); API = root + `/api/v1`. A PR URL already carries its root; in a checkout, take it from `origin`.
- A token goes only to its exact root: a `tea` login's token to that login's `url`, `GITEA_TOKEN` to `$GITEA_URL` when that is set. `GITEA_TOKEN` alone names no instance, so it is not sent. Never set or override `GITEA_URL` in a command: that redirects the token.
- The token lives in the environment only: keep it out of argv, URLs, files, logs, and output. Workers never receive it. Requests carrying it follow no redirects.
- 403, 404 (also returned for private repos you cannot see), empty lists, and missing fields mean unknown. Stop and report; they never mean "not reviewed yet".

## Request helper

```bash
python3 -I - GET https://git.example.com '/repos/<o>/<r>/pulls/<n>' <<'PY'   # METHOD ROOT PATH [BODY.json]
import os, re, sys, urllib.error, urllib.request
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
data = Path(sys.argv[4]).read_bytes() if len(sys.argv) > 4 else None
req = urllib.request.Request(root + "/api/v1" + path, data=data, method=method)
if data:
    req.add_header("Content-Type", "application/json")
if token:
    req.add_header("Authorization", "token " + token)
try:
    with urllib.request.build_opener(NoRedirect).open(req, timeout=60) as r:
        print(r.status, "total=" + (r.headers.get("X-Total-Count") or "?"), file=sys.stderr)
        sys.stdout.buffer.write(r.read())
except urllib.error.HTTPError as e:
    sys.exit(f"HTTP {e.code} {method} {path}: {e.read()[:300].decode(errors='replace')}")
PY
```

Lists page with `?page=N&limit=50`; read until an empty page or `total` is reached. The server may cap `limit`, so a short page is not the last one.

## Read

| Path under `/repos/<o>/<r>` | File | Used for |
| --- | --- | --- |
| `/pulls/<n>` | `pr.json` | `title`, `body`, `state`, `merged`, `draft`, `base.ref`; the head SHA is `head.sha` |
| `/pulls/<n>.diff` | `pr.diff` | the change |
| `/issues/<n>/comments` (all pages) | `comments.json` | step 1 marker check |
| `/pulls/<n>/reviews` (all pages) | `reviews.json` | step 1 marker check |

## Write (`--comment` only)

Run each through the helper with a JSON body file.

- Review: `POST /repos/<o>/<r>/pulls/<n>/reviews` with `{commit_id, event: "COMMENT", body, comments}`, each comment `{path, new_position: <line>, body}`. `new_position` is the line number in the new file, and it takes a single line.
- Top-level comment: `POST /repos/<o>/<r>/issues/<n>/comments` with `{body}`.
- Suggestion blocks are not allowed here: describe the fix in a plain code block.
- A 404 or 405 while the PR reads fine: the instance lacks the endpoint or the token lacks rights. Hand off the draft text and report nothing as posted.

## Link format

`https://<host>/<o>/<r>/src/commit/<full-sha>/package.json#L10-L15`
