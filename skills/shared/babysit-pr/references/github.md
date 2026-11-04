# GitHub backend

`gh` owns authentication; keep tokens out of commands. Verified account for attribution: `gh api user --jq .login` (add `--hostname <host>` on GitHub Enterprise).

## T3 Code native watcher

Inside T3 Code, use `watch_pull_request` instead of `pr-wait`, never both on one PR.

- Handle existing checks and comments first, then call `watch_pull_request` and end the turn. It wakes you on a failed check, required checks passing, a comment or review, or a conflict.
- Only the thread that owns the PR watches it. A delegated child task (reviewer, any `delegate_task` child) never calls it.
- A wake is news, not a merge decision. It reports conflicts only, so check BEHIND yourself: `gh pr view <n> --json mergeStateStatus`.
- Call `unwatch_pull_request` before handing off or asking the user anything. Merge or close ends the watch.
- "Stopped watching, could not read it" usually means the rate limit is spent: `gh api rate_limit --jq .resources.graphql`. Near 0 `remaining`: wait for `reset` with one background command, then watch once more.

## Rate limits

Every watcher on the account shares one limit. `gh pr view`, `gh pr checks`, and `gh pr create` use GraphQL; REST has its own budget: `gh api repos/<o>/<r>/pulls/<n>`, `gh api repos/<o>/<r>/commits/<sha>/check-runs`, `gh api repos/<o>/<r>/commits/<sha>/status`.

## Read

- Checks: `gh pr checks <n>`. Failing log: `gh run view <run-id> --log-failed`.
- Threads, with the IDs replies and resolution need:

  ```bash
  gh api graphql -F o=<owner> -F r=<repo> -F n=<n> -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved isOutdated comments(first:1){nodes{databaseId author{login} path}}}}}}}'
  ```

- Before replying to a Macroscope finding, read the repo's `.macroscope/check-run-agents/*.md`; its findings cite them. CodeRabbit is advisory: never wait or hold a merge for it.

## Write (granted actions only)

Write the body to a file and preview it first.

- Top-level comment: `gh pr comment <n> --body-file reply.md`
- Inline reply, to the thread's first comment `databaseId`: `gh api repos/<o>/<r>/pulls/<n>/comments/<comment-id>/replies -F body=@reply.md --jq .html_url`
- Resolve, after the reply URL came back; expect `true`:

  ```bash
  gh api graphql -F id=<thread-id> -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' --jq .data.resolveReviewThread.thread.isResolved
  ```
