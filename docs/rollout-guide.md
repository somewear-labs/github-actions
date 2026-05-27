# Rollout guide

## Recommended sequence per repo

1. **Coordinate with pod lead.** Walk through the Action's behavior; agree on `jira.project` and `jira.issue_type`.
2. **Open a warn-only wire-up PR.** Set `mode: warn-only` in the config.
3. **Add your repo to the JIRA_API_TOKEN org-secret allowed list** (ask repo owner).
4. **Merge the wire-up PR.**
5. **Observe.** New PRs should get warn-only comments. Watch for false positives.
6. **Flip to active.** Small PR setting `mode: active`. Get pod-lead sign-off on the diff.

## Common failures

### "Failed to create Jira ticket: 401 Unauthorized"
The `JIRA_API_TOKEN` org secret is missing, expired, or your repo isn't on its allowed list. Contact the repo owner.

### "Failed to create Jira ticket: 404 Project not found"
The `jira.project` key in your config doesn't exist or `pulse-bot` lacks create permission. Verify in Jira; fix the key or grant the permission.

### "Temporary Jira issue (503). Please add a Jira key manually."
Atlassian Cloud is having an incident. Add a key manually to unblock; the Action won't retry once it's posted this comment.

## Things the Action will not touch

- PRs whose title already contains a Jira key **anywhere** — at the start, mid-title, or at the end. The Action matches Jira's own PR-detection. You will not see auto-prepends on titles like `Fix ABC-123 regression`.
- PRs from authors listed in `ignore_authors`.
- PRs from contributors outside the `somewear-labs` org.
- PRs whose base ref does not have a `.github/jira-title.yml` config file.
- Draft PRs (until they're marked ready for review).
- PRs edited after their initial open/ready event — the Action does not re-fire on `edited`.
