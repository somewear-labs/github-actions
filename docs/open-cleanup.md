# Open cleanup queue

Issues surfaced by code reviews during Tasks 3-12 that remain open after the v1.0.2 cleanup pass. Most Important and Minor lib + doc items have been addressed in v1.0.2 — see CHANGELOG. What remains here is hardening with no functional impact, or work that's better folded into a future pilot follow-up.

Severity convention:
- **Important** — would mislead operators, drop coverage, or bite under real-world conditions.
- **Minor** — style, dead code, magic numbers, doc-accuracy.

---

## Library code (`lib/`)

### Important

- **`lib/main.js` + `lib/comments.js` — mock seams cannot be locked out of production.** Five env-var seams exist: `MOCK_SCENARIO`, `MOCK_GH_MEMBERSHIP`, `MOCK_GH_CONFIG_BODY`, `MOCK_TITLE_RACE_INJECT`, `MOCK_NO_GH_API`. Workflow YAML only exposes `MOCK_SCENARIO`; the others rely on the `env:` block not forwarding them (accidental defense-in-depth). Wire all five behind a single `MOCK_MODE=1` umbrella and document that `MOCK_MODE` must never be set in prod. Source: Task 7 code-review I1 + Task 12 deviation.

---

## Test infrastructure

### Important

- **`MOCK_NO_GH_API` removes GH-write coverage in CI.** Task 12 added this seam to bypass `pulls.update` + `ensureComment` + `fetchPrTitle` so act tests run without GitHub API calls. The act tests validate only the decision logic + Jira integration, not the GH write paths. v1.0.2 added try/catch around `pulls.update` and `fetchPrTitle` (recovery paths covered at the unit level) — combined with Task 14's fixture-repo smoke against real GH, the gap is acceptable but worth re-evaluating once a real failure surfaces. Source: Task 12 deviation.

### Minor

- **`package.json` — `express` is a runtime dependency only because of test fixtures.** Task 12 added `express` to root `dependencies` to fix CI's mock-server boot. Express is only used by `fixtures/jira-mock/server.js`. Move back to `fixtures/jira-mock/package.json` and add `cd fixtures/jira-mock && npm ci` to the CI workflow's mock-boot step. Reduces consumer-install size.

- **`.github/workflows/test-pr-title-jira.yml` is a duplicate workflow.** Exists because act can't trigger the production workflow's `workflow_call`. v1.0.1 gated it to `workflow_dispatch` so it no longer fires on real PRs. Decide whether to keep permanently or fold back into `pr-title-jira.yml` with a multi-trigger setup.

---

## Documentation (`docs/`)

_All minor doc items addressed in v1.0.6._

---

## Repo-level polish (carried from Task 1 deferrals)

User-action items, no code:

- Branch protection on `main` (require PR + at least the `schema` and `act` CI checks).
- `LICENSE` file (the README references `UNLICENSED`; pick a license or leave it).
- `SECURITY.md` (vulnerability-disclosure policy).
- Enable secret-scanning + push protection on the repo.

---

## Done in v1.0.6

- `lib/jira.js` honors `Retry-After` response header on 429 / 5xx (clamped to 30s, falls back to fixed schedule when absent). 429 also moved from non-retryable 4xx to the retryable group, matching the original spec.
- `docs/architecture.md` refreshed: dropped stale pulse-bot identity, corrected LOC estimate, made fixture-repo bullet present-tense + linked.

## Done in v1.0.2

Removed from this file because they're addressed on `main`:

### Library (Important)
- `JIRA_API_TOKEN` missing produces silent gibberish → early-exit with `fail-missing-token` decision and clear operator message.
- `fetchPrTitle` has no error handling → wrapped in try/catch, warns + continues to PATCH on failure.
- `pulls.update` has no error handling → wrapped in try/catch, emits `patch-failed` decision + recovery comment with ticket link.

### Library (Minor)
- `repoCoords(context)` helper extracted in `lib/repo-coords.js`, used at 4 call sites.
- `lib/comments.js` destructured-ternary owner-resolution replaced with `repoCoords`.
- `lib/config.js` invalid path now returns `found: true`.
- YAML parse vs schema violation now produce distinct decision codes (`fail-config-syntax` vs `fail-schema-invalid`).
- `maybeMockConfig` dedupe via shared `validateConfigBody` helper.
- `truncate` is now used in Step 8 (no more inline duplication).
- `MAX = 256` renamed to `GITHUB_PR_TITLE_MAX` with a comment.

### Documentation (Important)
- 256-char truncation behavior documented (consumer-setup §5).
- `JIRA_BASE_URL` override documented (consumer-setup §6 Advanced).
- `JIRA_USER_EMAIL` org variable documented (consumer-setup §1, also gates the `@theo-gordon` link via CODEOWNERS instead of hard-coding).
- `description_template` config key documented (consumer-setup §2).
- Failure-comment headings in rollout-guide rewritten to match emitted format (missing-token, 4xx, 5xx, PATCH-failed, race-lost).
