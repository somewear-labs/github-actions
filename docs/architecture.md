# Architecture

The full design lives in [`superpowers/specs/2026-05-19-pr-title-jira-action-design.md`](superpowers/specs/2026-05-19-pr-title-jira-action-design.md). This page is a short orientation.

## What it is

A reusable GitHub Actions workflow that auto-creates Jira tickets for PRs whose titles lack a Jira key. Idempotent. Stateless. Per-repo opt-in via `.github/jira-title.yml`.

## Key decisions

- **Trigger:** `pull_request_target` on `opened` (non-draft) + `ready_for_review` only.
- **Identity:** any Atlassian account with create-issue permission on the target Jira project. The org-level `JIRA_API_TOKEN` secret holds the API token; the org-level `JIRA_USER_EMAIL` variable holds the email it was issued for. Both must include each consumer repo on their allowed-repos list. (Initial v1 rollout uses `travis@somewearlabs.com`; a dedicated bot account was deferred — see `docs/open-cleanup.md`.)
- **Failure mode:** Soft-blocking. 4xx loud (red check + PR comment); 5xx retried then graceful exit 0 with a recovery comment. Never a required check by default.
- **Idempotency:** anywhere-in-title key detection (matches Jira's own PR-detection). Comments are dedupe'd via HTML-sentinel + per-kind marker.
- **Implementation:** inline JS via `actions/github-script@v7`, ~500 LOC across `lib/*.js`.

## Test strategy

- `act` runs synthetic event JSON fixtures against a local Jira mock (Express).
- `scripts/test-schema.js` validates the JSON Schema against valid + invalid fixtures.
- Self-CI workflow at `.github/workflows/ci.yml` runs both on push.
- Integration smoke in [`somewear-labs/github-actions-fixture`](https://github.com/somewear-labs/github-actions-fixture) against real Jira (`SBE` project). Open a scratch PR there to validate any cross-version change end-to-end.

## Maintenance

- Owner: see `.github/CODEOWNERS`.
- SemVer with moving `v1` tag. Consumers pin `@v1`.
- Changes that affect the title-edit format or the per-repo config schema are breaking and require a major bump.
