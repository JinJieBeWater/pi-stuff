import json
import pathlib
import subprocess
import sys
import tempfile
import unittest


SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "validate-review.py"


class ReviewValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="review-validator-test-")
        self.addCleanup(self.temp.cleanup)
        self.repo = pathlib.Path(self.temp.name)
        self.git("init", "-q")
        (self.repo / "app.txt").write_text("before\n")
        self.commit("base")
        self.base = self.git("rev-parse", "HEAD").decode().strip()
        (self.repo / "app.txt").write_text("after\n")
        self.commit("change")
        self.snapshot = self.repo / ".git" / "review-snapshot.json"
        self.state_path = self.repo / ".git" / "review-state.json"
        self.state = {
            "lanes": dict.fromkeys(("correctness", "rules", "resources", "gate"), "done"),
            "candidate_ids": [],
            "dispositions": [],
        }

    def git(self, *args):
        return subprocess.check_output(
            ["git", "-c", "user.name=Review Test", "-c", "user.email=review@example.invalid",
             "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", *args],
            cwd=self.repo,
        )

    def commit(self, message):
        self.git("add", ".")
        self.git("commit", "-qm", message)

    def cli(self, *args, expected=0):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, args)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def capture(self, *args):
        data = self.cli("capture", "--repo", self.repo, *(args or ("--base", self.base)))
        self.snapshot.write_text(json.dumps(data))
        return data

    def check(self, expected=0):
        self.state_path.write_text(json.dumps(self.state))
        return self.cli("check", self.snapshot, self.state_path, expected=expected)

    def test_completed_review_with_no_candidates_is_complete(self):
        self.capture()
        result = self.check()
        self.assertEqual(result["status"], "complete")
        self.assertTrue(result["input_valid"])

    def test_candidates_need_exactly_one_supported_disposition(self):
        self.capture()
        confirmed = {"id": "correctness-001", "decision": "confirmed", "evidence": "app.txt:1: causal evidence"}
        cases = [
            (["correctness-001"], [], 2),
            (["correctness-001", "correctness-001"], [confirmed], 2),
            ([], [confirmed], 2),
            (["correctness-001"], [confirmed, confirmed], 2),
            (["correctness-001"], [{**confirmed, "decision": "maybe"}], 2),
            (["correctness-001"], [{**confirmed, "evidence": " "}], 2),
            (["correctness-001"], [confirmed], 0),
        ]
        for ids, dispositions, expected in cases:
            with self.subTest(ids=ids, dispositions=dispositions):
                self.state["candidate_ids"] = ids
                self.state["dispositions"] = dispositions
                result = self.check(expected)
                self.assertEqual(result["status"], "complete" if expected == 0 else "invalid")

    def test_duplicate_dispositions_point_directly_to_retained_candidates(self):
        self.capture()
        self.state["candidate_ids"] = ["correctness-001", "rules-001"]
        retained = {"id": "correctness-001", "decision": "confirmed", "evidence": "app.txt:1: causal evidence"}
        duplicate = {"id": "rules-001", "decision": "duplicate", "evidence": "same root cause"}
        cases = [
            (retained, duplicate, 2),
            (retained, {**duplicate, "duplicate_of": "missing-001"}, 2),
            (retained, {**duplicate, "duplicate_of": "rules-001"}, 2),
            ({**retained, "decision": "rejected"}, {**duplicate, "duplicate_of": "correctness-001"}, 2),
            (retained, {**duplicate, "duplicate_of": "correctness-001"}, 0),
            ({**retained, "decision": "unverified"}, {**duplicate, "duplicate_of": "correctness-001"}, 0),
        ]
        for target, item, expected in cases:
            with self.subTest(target=target, item=item):
                self.state["dispositions"] = [target, item]
                self.check(expected)

    def test_failed_or_unfinished_lanes_are_never_complete(self):
        self.capture()
        for lane in self.state["lanes"]:
            for status in ("blocked", "failed", "cancelled", "pending", "working", "unknown"):
                with self.subTest(lane=lane, status=status):
                    self.state["lanes"][lane] = status
                    self.assertEqual(self.check(expected=1)["status"], "incomplete")
                    self.state["lanes"][lane] = "done"

    def test_duplicate_json_keys_cannot_overwrite_a_failed_lane(self):
        self.capture()
        failed = {**self.state["lanes"], "resources": "failed"}
        self.state_path.write_text('{"lanes":' + json.dumps(failed) + ',' + json.dumps(self.state)[1:])
        self.cli("check", self.snapshot, self.state_path, expected=2)

    def test_branch_head_movement_retains_original_binding_and_warns(self):
        original = self.capture()
        (self.repo / "app.txt").write_text("new head\n")
        self.commit("later change")
        result = self.check()
        self.assertEqual(result["bound_head"], original["head"])
        self.assertNotEqual(result["current_head"], original["head"])
        self.assertTrue(result["warnings"])

    def test_capture_digest_mismatch_cannot_pass(self):
        original = self.capture()
        original["diff_sha256"] = "0" * 64
        self.snapshot.write_text(json.dumps(original))
        self.assertFalse(self.check(expected=1)["input_valid"])

    def test_untracked_content_change_is_detected_even_when_git_status_is_unchanged(self):
        note = self.repo / "review note\n.txt"
        note.write_text("version one\n")
        self.capture("--worktree", "--include", note.name)
        before = self.git("status", "--porcelain=v1", "-z")
        note.write_text("version two\n")
        self.assertEqual(before, self.git("status", "--porcelain=v1", "-z"))
        self.assertFalse(self.check(expected=1)["input_valid"])

    def test_tracked_worktree_change_invalidates_input(self):
        (self.repo / "app.txt").write_text("pending\n")
        self.capture("--worktree")
        (self.repo / "app.txt").write_text("changed again\n")
        self.assertFalse(self.check(expected=1)["input_valid"])

    def test_new_untracked_path_requires_scope_confirmation(self):
        self.capture("--worktree")
        (self.repo / "new.txt").write_text("new input\n")
        self.assertFalse(self.check(expected=1)["input_valid"])

    def test_worktree_head_movement_invalidates_input(self):
        (self.repo / "app.txt").write_text("pending\n")
        self.capture("--worktree")
        self.commit("commit pending work")
        self.assertFalse(self.check(expected=1)["input_valid"])

    def test_untracked_symlink_is_hashed_without_reading_its_target(self):
        with tempfile.TemporaryDirectory(prefix="review-outside-test-") as outside:
            target = pathlib.Path(outside) / "secret.txt"
            target.write_text("original secret\n")
            link = self.repo / "external-link"
            link.symlink_to(target)
            self.capture("--worktree", "--include", link.name)
            target.write_text("changed secret\n")
            self.assertTrue(self.check()["input_valid"])
            link.unlink()
            link.symlink_to(target.with_name("another.txt"))
            self.assertFalse(self.check(expected=1)["input_valid"])

    def test_capture_rejects_ignored_tracked_and_outside_includes(self):
        (self.repo / ".gitignore").write_text("*.key\n")
        (self.repo / "secret.key").write_text("not review input\n")
        for name in ("secret.key", "app.txt", "../outside.txt", "/etc/hosts"):
            with self.subTest(name=name):
                self.cli("capture", "--repo", self.repo, "--worktree", "--include", name, expected=2)

    def test_malformed_metadata_returns_invalid_instead_of_crashing(self):
        self.capture()
        self.state["lanes"]["gate"] = "donee"
        self.check(expected=2)
        self.state["lanes"]["gate"] = "done"
        original = self.capture("--worktree")
        for field, value in (("untracked_paths", {}), ("untracked_sha256", []),
                             ("untracked_sha256", {"missing.txt": "not-a-digest"})):
            with self.subTest(field=field, value=value):
                self.snapshot.write_text(json.dumps({**original, field: value}))
                self.check(expected=2)

    def test_capture_does_not_execute_repository_fsmonitor(self):
        hook = self.repo / ".git" / "fsmonitor-hook"
        hook.write_text('#!/bin/sh\nprintf invoked > "$0.called"\nprintf "\\0"\n')
        hook.chmod(0o700)
        self.git("config", "core.fsmonitor", str(hook))
        self.capture()
        self.assertFalse(hook.with_name(hook.name + ".called").exists())

    def test_capture_from_subdirectory_covers_the_repository_root(self):
        child = self.repo / "source"
        child.mkdir()
        (child / "local.txt").write_text("local input\n")
        (self.repo / "other.txt").write_text("root input\n")
        result = self.cli("capture", "--repo", child, "--worktree", "--include", "other.txt")
        self.assertEqual(result["repo"], str(self.repo.resolve()))
        self.assertEqual(result["untracked_paths"], ["other.txt", "source/local.txt"])


if __name__ == "__main__":
    unittest.main()
