# Changelog

## [Unreleased]

## [1.0.6] - 2026-06-03

### Changed
- **Honor `Retry-After` response header on 429 / 5xx.** Previously the action used a fixed `[1s, 2s, 4s]` backoff schedule regardless of what Jira asked for, and treated 429 as a non-retryable 4xx. Now 429 is retried alongside 5xx, and the server-supplied `Retry-After: <seconds>` value is used as the delay when present (clamped to 30s, falling back to the fixed schedule otherwise). Atlassian rarely 429s on single-issue creates so this is hardening, not bug-fix.

### Docs
- `docs/architecture.md` — refreshed for current reality: dropped stale `pulse-bot` identity reference, corrected LOC estimate (~300 → ~500), made the fixture-repo bullet present-tense + linked.

### Pilot
- Active mode rolled out to `somewear-labs/ataklibs` on 2026-06-03 (warn-only + flip in one pass). First production consumer.

## [1.0.5] - 2026-06-03

### Fixed
- **Convert ticket description to Atlassian Document Format (ADF).** Jira Cloud REST API v3 rejects raw-string descriptions with HTTP 400 (`The field value is not valid Atlassian Document Format (ADF) content.`); only v2 accepted strings. The action used v3 throughout but sent plain text. New `textToAdf(text)` helper in `lib/jira.js` wraps the rendered description in a minimal ADF doc: double-newlines split into paragraph blocks, single newlines become hardBreak inline nodes. Markdown formatting in PR bodies still appears as plain text in Jira (acceptable for v1; richer mapping deferred).

### Surfaced by
Task 14 fixture-repo smoke against real SBE Jira (run 26908102302).

## [1.0.4] - 2026-05-27

### Changed
- **External-contributor guard now reads `pull_request.author_association` from the webhook payload** instead of calling `github.rest.orgs.checkMembershipForUser`. The orgs API requires `members: read` permission that `GITHUB_TOKEN` under Actions can't grant; the payload field carries the same authoritative data with no extra perms. Treats `OWNER`, `MEMBER`, `COLLABORATOR` as internal; everything else as external.

### Docs
- **Consumer-setup now requires both `contents: read` AND `pull-requests: write`** in the caller workflow's permissions block. The action reads `.github/jira-title.yml` and the PR title via the GitHub API; `contents: read` is required. A reusable workflow's permissions are intersected with the caller's, so the caller must declare both — declaring only `pull-requests: write` causes HTTP 403 "Resource not accessible by integration."
- Reusable workflow's own permissions block now declares both with an explanatory comment.

### Surfaced by
Task 14 fixture-repo smoke (third attempt) — the original plan's caller-workflow YAML and the spec didn't anticipate the `contents: read` requirement.

## [1.0.3] - 2026-05-27

### Fixed
- Reusable workflow's `actions/checkout` step now pins to `ref: v1` (the moving major tag) instead of deriving from `github.workflow_sha`. Surfaced during the Task 14 fixture-repo smoke: under `pull_request_target` triggered from a consumer repo, `github.workflow_sha` resolves to the *caller's* commit SHA — not the called workflow's — so checkout was trying to fetch a fixture-repo SHA from `somewear-labs/github-actions` and failing with "Repository not found." Pinning to `v1` matches what consumers `uses:` anyway.

## [1.0.2] - 2026-05-27

Cleanup pass surfaced by code reviews during the v1.0.0 implementation. Library and docs hardened ahead of the first real pilot consumer.

### Added
- `lib/repo-coords.js` — single helper for resolving `{owner, repo}` from webhook payloads. Used at 4 call sites (was 4 inconsistent inline resolutions).
- `lib/config.js` `validateConfigBody(rawYaml)` — shared validation helper now used by both `loadConfig` and the act test seam (`maybeMockConfig`), so the validation + error-shape contract stays in lock-step.
- `lib/jira.js` — explicit `JIRA_API_TOKEN` presence check; missing token surfaces as a clear `MISSING_JIRA_TOKEN` error rather than letting basic-auth encode `email:undefined` and getting an opaque 401.

### Changed
- `lib/main.js` Step 7 (compare-and-swap title refetch) now wraps `pulls.get` in try/catch — transient GitHub failures warn-and-continue to PATCH instead of crashing with a stack trace after the Jira ticket is created.
- `lib/main.js` Step 9 (title PATCH) now wraps `pulls.update` in try/catch — failures (422 branch-protection, 404 PR closed, 429 rate-limit, 5xx transient) emit a `patch-failed` decision and a recovery comment linking the still-created Jira ticket, instead of leaking the ticket invisibly.
- YAML parse errors and schema violations now produce distinct decision codes (`fail-config-syntax` vs `fail-schema-invalid`) so operators don't chase the wrong fix.
- Missing-token failure surfaces as its own decision code (`fail-missing-token`) with a comment that says exactly what's wrong, instead of co-mingling with config-validity errors.
- Step 8 title-truncation now calls the same `truncate()` helper as `lib/jira.js` summary-truncation. `MAX = 256` magic number renamed to `GITHUB_PR_TITLE_MAX` with a comment.
- `lib/comments.js` owner-resolution now uses `repoCoords` (the prior destructured-ternary had an unreachable fallback branch).
- `lib/config.js` invalid-config returns now consistently include `found: true` (parity with the docstring contract).

### Docs
- `docs/consumer-setup.md` — added `JIRA_USER_EMAIL` org-variable setup (§1), `description_template` config-key mention (§2), 256-char truncation explanation (§5), and `JIRA_BASE_URL` override (§6 Advanced).
- `docs/rollout-guide.md` — failure-comment headings rewritten to match the format the code actually emits (missing-token, 4xx, 5xx, PATCH-failed, race-lost).

### Deferred
See `docs/open-cleanup.md` for what's still outstanding (Retry-After on 429, `MOCK_MODE` umbrella, `express` dep migration, repo-level polish).

## [1.0.1] - 2026-05-27

### Changed
- Reusable workflow now forwards `vars.JIRA_USER_EMAIL` to the action, letting consumers configure the basic-auth identity via an org/repo variable instead of relying on the hardcoded default in `lib/jira.js`. Backward-compatible: if unset, the previous default is still used.

### Fixed
- Self-CI: act test harness workflow (`.github/workflows/test-pr-title-jira.yml`) now triggers on `workflow_dispatch` instead of `pull_request_target`, so it no longer attempts to run against real PRs opened against this repo (which failed due to missing `contents: read` permission).

## [1.0.0] - 2026-05-26

### Added
- `pr-title-jira.yml` reusable workflow.
- JSON Schema for `.github/jira-title.yml` per-repo config.
- Local test harness: act-driven workflow tests + Jira mock server.
- Documentation: consumer-setup, rollout-guide, architecture.
