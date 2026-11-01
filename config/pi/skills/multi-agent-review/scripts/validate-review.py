"""Capture Git review inputs and check a structured review-state before reporting."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess


LANES = {"correctness", "rules", "resources", "gate"}


def git(repo, *args):
    return subprocess.run(
        ["git", "-c", "core.fsmonitor=false", "-C", str(repo), *args],
        check=True, capture_output=True, env={**os.environ, "GIT_OPTIONAL_LOCKS": "0"},
    ).stdout


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_json(path):
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key: " + key)
            result[key] = value
        return result
    return json.loads(path.read_text(), object_pairs_hook=unique_object)


def untracked_paths(repo):
    return sorted(os.fsdecode(name) for name in git(repo, "ls-files", "--others", "--exclude-standard", "-z").split(b"\0") if name)


def file_fingerprint(repo, name):
    relative = Path(name)
    root = Path(repo).resolve()
    if relative.is_absolute() or not relative.parts or ".." in relative.parts:
        raise ValueError("untracked paths must be repo-relative without parent traversal")
    path = root / relative
    if not path.parent.resolve().is_relative_to(root):
        raise ValueError("untracked parent escapes the repository")
    if path.is_symlink():
        return sha256(b"symlink\0" + os.fsencode(os.readlink(path)))
    if not path.is_file():
        raise ValueError("untracked input is not a regular file or symlink: " + name)
    return sha256(b"file\0" + path.read_bytes())


def diff(snapshot):
    args = ["diff", "--no-ext-diff", "--no-textconv"]
    args += [snapshot["base"] + "..." + snapshot["head"]] if snapshot["mode"] == "branch" else [snapshot["head"], "--"]
    return git(snapshot["repo"], *args)


def capture(args):
    root = git(Path(args.repo).resolve(), "rev-parse", "--show-toplevel").removesuffix(b"\n")
    repo = Path(os.fsdecode(root)).resolve()
    head = git(repo, "rev-parse", "--verify", "HEAD^{commit}").decode().strip()
    snapshot = {"repo": str(repo), "head": head, "mode": "worktree" if args.worktree else "branch"}
    if args.worktree:
        paths = untracked_paths(repo)
        if not set(args.include).issubset(paths):
            raise ValueError("--include accepts only non-ignored untracked paths")
        snapshot["untracked_paths"] = paths
        snapshot["untracked_sha256"] = {name: file_fingerprint(repo, name) for name in args.include}
    else:
        if args.include:
            raise ValueError("--include is only available with --worktree")
        base = git(repo, "rev-parse", "--verify", "--end-of-options", args.base + "^{commit}").decode().strip()
        snapshot.update(base=base, merge_base=git(repo, "merge-base", base, head).decode().strip())
        snapshot["dirty"] = bool(git(repo, "status", "--porcelain=v1", "-z"))
    snapshot["diff_sha256"] = sha256(diff(snapshot))
    return snapshot


def input_status(snapshot):
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("repo"), str):
        raise ValueError("snapshot must contain a repository path")
    if snapshot["mode"] not in {"branch", "worktree"}:
        raise ValueError("unsupported snapshot mode")
    for key in (["head", "base"] if snapshot["mode"] == "branch" else ["head"]):
        if not isinstance(snapshot[key], str) or not re.fullmatch(r"(?:[0-9a-f]{40}|[0-9a-f]{64})", snapshot[key]):
            raise ValueError("snapshot commit must be a full SHA: " + key)
    if not isinstance(snapshot["diff_sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", snapshot["diff_sha256"]):
        raise ValueError("snapshot diff_sha256 must be a SHA-256 digest")
    if snapshot["mode"] == "worktree":
        paths, selected = snapshot["untracked_paths"], snapshot["untracked_sha256"]
        if not isinstance(paths, list) or any(not isinstance(name, str) for name in paths):
            raise ValueError("untracked_paths must be a list of paths")
        if paths != sorted(set(paths)) or not isinstance(selected, dict):
            raise ValueError("untracked paths must be unique and selected digests must be an object")
        for name, digest in selected.items():
            if name not in paths or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError("selected untracked input must have a captured path and SHA-256 digest")
    errors, warnings = [], []
    current_head = git(snapshot["repo"], "rev-parse", "HEAD").decode().strip()
    if sha256(diff(snapshot)) != snapshot["diff_sha256"]:
        errors.append("tracked diff differs from captured input")
    if snapshot["mode"] == "branch":
        if current_head != snapshot["head"]:
            warnings.append("HEAD changed; report remains bound to " + snapshot["head"])
    else:
        if current_head != snapshot["head"]:
            errors.append("worktree HEAD changed")
        paths = untracked_paths(snapshot["repo"])
        if paths != snapshot["untracked_paths"]:
            errors.append("untracked path set changed; reconfirm review scope")
        for name, digest in snapshot["untracked_sha256"].items():
            if name not in paths or file_fingerprint(snapshot["repo"], name) != digest:
                errors.append("selected untracked input changed: " + name)
    return errors, warnings, current_head


def check(snapshot, review):
    if not isinstance(review, dict) or not isinstance(review.get("lanes"), dict):
        raise ValueError("review-state and lanes must be objects")
    if set(review["lanes"]) != LANES:
        raise ValueError("lanes must contain correctness, rules, resources and gate")
    if any(status not in {"done", "blocked", "failed", "cancelled", "pending", "working", "unknown"}
           for status in review["lanes"].values()):
        raise ValueError("unsupported lane status")
    ids = review["candidate_ids"]
    if not isinstance(ids, list) or any(not isinstance(item, str) or not item.strip() for item in ids):
        raise ValueError("candidate_ids must be a list of nonempty strings")
    if len(set(ids)) != len(ids):
        raise ValueError("candidate IDs must be unique")
    dispositions = review["dispositions"]
    if not isinstance(dispositions, list):
        raise ValueError("dispositions must be a list")
    by_id = {}
    for item in dispositions:
        if not isinstance(item, dict):
            raise ValueError("each disposition must be an object")
        if item["id"] in by_id:
            raise ValueError("each candidate needs exactly one disposition")
        if item["decision"] not in {"confirmed", "rejected", "duplicate", "unverified"}:
            raise ValueError("unsupported disposition")
        if not isinstance(item.get("evidence"), str) or not item["evidence"].strip():
            raise ValueError("each disposition needs nonempty evidence")
        by_id[item["id"]] = item
    if set(ids) != set(by_id):
        raise ValueError("dispositions must cover exactly the candidate IDs")
    for item in dispositions:
        if item["decision"] == "duplicate":
            target = by_id.get(item.get("duplicate_of"))
            if target is None or target["decision"] not in {"confirmed", "unverified"}:
                raise ValueError("duplicate_of must point directly to a retained candidate")
        elif "duplicate_of" in item:
            raise ValueError("only duplicate dispositions may have duplicate_of")
    unfinished = [name for name, status in review["lanes"].items() if status != "done"]
    errors, warnings, current_head = input_status(snapshot)
    input_valid = not errors
    if unfinished:
        errors.append("unfinished lanes: " + ", ".join(sorted(unfinished)))
    return {
        "status": "incomplete" if errors else "complete",
        "input_valid": input_valid, "errors": errors,
        "warnings": warnings, "bound_head": snapshot["head"], "current_head": current_head,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    snapshot_parser = commands.add_parser("capture", help="capture immutable input metadata as JSON")
    snapshot_parser.add_argument("--repo", required=True)
    mode = snapshot_parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--base")
    mode.add_argument("--worktree", action="store_true")
    snapshot_parser.add_argument("--include", action="append", default=[], metavar="REPO_PATH")
    check_parser = commands.add_parser("check", help="check inputs and the review-state JSON")
    check_parser.add_argument("snapshot", type=Path)
    check_parser.add_argument("review", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "capture":
            result = capture(args)
        else:
            result = check(read_json(args.snapshot), read_json(args.review))
        print(json.dumps(result, ensure_ascii=True))
        return 1 if result.get("status") == "incomplete" else 0
    except (ValueError, OSError, KeyError, TypeError, subprocess.CalledProcessError) as exc:
        print(json.dumps({"status": "invalid", "errors": [str(exc)]}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
