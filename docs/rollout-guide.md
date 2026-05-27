# Rollout guide

## Recommended sequence per repo

1. **Coordinate with pod lead.** Walk through the Action's behavior; agree on `jira.project` and `jira.issue_type`.
2. **Open a warn-only wire-up PR.** Set `mode: warn-only` in the config.
3. **Add your repo to the JIRA_API_TOKEN org-secret allowed list** (ask repo owner).
4. **Merge the wire-up PR.**
5. **Observe.** New PRs should get warn-only comments. Watch for false positives.
6. **Flip to active.** Small PR setting `mode: active`. Get pod-lead sign-off on the diff.

## Common failures

The action surfaces failures as a PR comment AND a red check on the PR. Exact text is built from Jira's response, so quoted examples below show the format, not a verbatim string.

### Missing token: `Failed to create Jira ticket: JIRA_API_TOKEN environment variable is not set.`

The `JIRA_API_TOKEN` org secret either isn't set or your repo isn't on its allowed-repos list. The action exits before contacting Jira so there's no HTTP status to interpret. Contact the repo owner to add your repo to the allowlist.

### 4xx errors: `Failed to create Jira ticket: <status> <Jira's errorMessages>. Please fix .github/jira-title.yml ...`

- **401**: token is expired, revoked, or `JIRA_USER_EMAIL` doesn't match the token's owner. Rotate the token under the right Atlassian account.
- **404**: `jira.project` doesn't exist or the token's owner lacks "Create Issues" permission on it. Verify the project key in Jira; grant the permission.
- **400**: schema-level validation failed inside Jira (e.g. wrong `issue_type` for that project). Adjust `.github/jira-title.yml` and re-open the PR.

The action sets a red check and doesn't retry — fix the config and re-open (or close+reopen) the PR.

### 5xx errors: `Temporary Jira issue (<status>). Please add a Jira key to this PR title manually; the Action will not retry.`

Atlassian Cloud is having a transient incident. The action already retried up to 3 times with exponential backoff before posting this comment. Add a Jira key to the PR title manually to unblock; the action won't re-fire on `edited` events.

### PR title PATCH failed: `Created [KEY](url) but could not update the PR title (<status>: <message>). Please prefix the title with KEY: manually.`

The Jira ticket was created but updating the PR title failed. Common causes: branch-protection rejects title edits (422), PR was closed mid-run (404), GitHub rate limit (429). The ticket isn't leaked — the comment links it — but you'll need to prefix the title yourself.

### Race lost (no comment, just a warning in the run log): `Race detected: PR title now "..." already has a key. Leaked Jira ticket: KEY (manual cleanup needed).`

Someone (you, a teammate, or a sibling workflow run) added a Jira key to the title while the action was in the middle of creating the ticket. The created ticket is left behind — close it manually in Jira and add a comment linking the PR.

## Things the Action will not touch

- PRs whose title already contains a Jira key **anywhere** — at the start, mid-title, or at the end. The Action matches Jira's own PR-detection. You will not see auto-prepends on titles like `Fix ABC-123 regression`.
- PRs from authors listed in `ignore_authors`.
- PRs from contributors outside the `somewear-labs` org.
- PRs whose base ref does not have a `.github/jira-title.yml` config file.
- Draft PRs (until they're marked ready for review).
- PRs edited after their initial open/ready event — the Action does not re-fire on `edited`.
