# GitHub backend

`gh` owns authentication; keep tokens out of commands. On GitHub Enterprise, add `--hostname <host>` to `gh api` calls.

## Read

```sh
gh pr view <n> --json title,body,state,isDraft,author,headRefOid,baseRefName,comments,reviews > pr.json
gh pr diff <n> > pr.diff
```

`pr.json` holds everything step 1 reads: `state`, `isDraft`, `comments`, `reviews`. The head SHA is `headRefOid`.

## Write (`--comment` only)

- Review: put `{commit_id, event: "COMMENT", body, comments}` in a JSON file, with each comment `{path, line, side: "RIGHT", body}` plus `start_line` for a range, then `gh api repos/<o>/<r>/pulls/<n>/reviews --input <file> --jq .html_url`.
- Top-level comment: `gh pr comment <n> --body-file <file>`.
- Suggestion blocks are allowed.

## Link format

`https://github.com/<o>/<r>/blob/<full-sha>/package.json#L10-L15`
