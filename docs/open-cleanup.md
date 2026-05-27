# Open cleanup queue

Issues surfaced by code reviews during Tasks 3-12 (initial v1.0.0 implementation), deferred for a batch cleanup pass. Process this list before Task 15 (`ataklibs` pilot) so the pilot consumer hits hardened code.

Severity convention:
- **Important** — would mislead operators, drop coverage, or bite under real-world conditions. Address before pilot.
- **Minor** — style, dead code, magic numbers, doc-accuracy. Bundle when convenient.

---

## Library code (`lib/`)

### Important

- **`lib/jira.js` — JIRA_API_TOKEN missing produces silent gibberish.** When the secret isn't set, `authHeader()` base64-encodes `"email:undefined"` and Jira returns 401. The action then emits `fail-jira-4xx` with the misleading message "fix project key, issue type, or auth." Add an early presence check that returns `{ok: false, kind: '4xx', status: 0, message: 'JIRA_API_TOKEN not set'}` (or rejects at module load). Source: Task 8 code-review I1.

- **`lib/jira.js` — `Retry-After` header ignored on 429.** Spec says "5xx or 429 → retry" and the code does retry, but uses a fixed `[1000, 2000, 4000]` schedule even when Jira sets `Retry-After`. Add support with a sane upper-clamp (e.g. min(retry_after, 30s)). Source: Task 8 code-review I2.

- **`lib/main.js` — `fetchPrTitle` has no error handling.** A transient 5xx / rate-limit / network blip on `github.rest.pulls.get` throws after the Jira ticket has been created, so the leaked-ticket warning never fires and the operator gets a stack trace instead of `DECISION=skip-race-lost`. Wrap in try/catch and fall through with a `core.warning` + `cas-fetch-failed` decision marker, then continue to PATCH. Source: Task 9 code-review Important #1.

- **`lib/main.js` Step 9 — `pulls.update` has no error handling.** Same risk class as `fetchPrTitle`: 422 (branch protection rejected the title), 404 (PR closed mid-run), 429 (rate-limited) all throw after the Jira ticket is created, before the success comment posts. Worst-case: leaked ticket + no PR comment + red-X stack trace. Wrap in try/catch with explicit decision codes. Source: Task 10 code-review Important #1.

- **`lib/main.js` + `lib/comments.js` — mock seams cannot be locked out of production.** Four env-var seams now exist: `MOCK_SCENARIO`, `MOCK_GH_MEMBERSHIP`, `MOCK_GH_CONFIG_BODY`, `MOCK_TITLE_RACE_INJECT`, and the Task-12 addition `MOCK_NO_GH_API`. `MOCK_SCENARIO` is exposed in workflow YAML; the others rely on the workflow's `env:` block not forwarding them (accidental defense-in-depth). Wire all five behind a single `MOCK_MODE=1` umbrella and document that `MOCK_MODE` must never be set in prod. Source: Task 7 code-review I1 + Task 12 deviation.

### Minor

- **`lib/main.js` — `maybeMockConfig` duplicates schema compile + drops `addFormats`.** The mock-config path inside `maybeMockConfig` repeats the `new Ajv(...).compile(schema)` setup from `lib/config.js` but skips `addFormats(ajv)` and uses a different error-message shape (`e.message` vs `${e.instancePath} ${e.message}`). Will drift silently once the schema starts using `format:` keywords. Extract a shared `validateConfigBody(rawYaml)` helper. Source: Task 7 code-review I2.

- **`lib/main.js` — `truncate` imported but unused.** Step 8 inlines the truncation logic instead of calling `truncate(s, maxLen)` from `lib/jira.js`. Either delete the import or refactor Step 8 to call `truncate(pr.title, MAX - prefix.length)`. Source: Task 10 code-review Minor #3.

- **`lib/main.js` — `MAX = 256` is a magic number.** Rename to `GITHUB_PR_TITLE_MAX` and add a one-line comment ("UTF-16 code units per gh-api"). Source: Task 10 code-review Minor #4.

- **Inconsistent repo-coords resolution across files.** `lib/config.js` uses `repository.name || full_name.split('/')[1]`; `lib/main.js#fetchPrTitle` and Step 9 PATCH use only `full_name.split('/')[1]`; `lib/comments.js` uses a destructured ternary that has an unreachable fallback branch. Extract one helper `function repoCoords(context) { return {owner, repo}; }` and call from all four sites. Source: Task 5 minor + Task 9 minor + Task 10 minor.

- **`lib/comments.js` — destructured-ternary owner-resolution is unreachable fallback.** `const { owner } = condition ? {owner: X} : {owner: Y}` — if `repository.owner` is undefined, the condition throws TypeError before the fallback runs, so the `full_name.split('/')[0]` branch is dead unless `.owner.login` is falsy (which GitHub never sends). Replace with `repository.owner?.login ?? full_name.split('/')[0]`. Source: Task 7 code-review M1.

- **`lib/config.js` — invalid path returns no `found: true`.** The contract in the docstring says `found: true | false` is the "did the file exist" signal, but invalid YAML / schema-invalid returns just `{ok: false, errors}` without `found`. A future caller checking `cfg.found` on the invalid path will see `undefined`. Add `found: true` to both invalid return branches. Source: Task 5 code-review I1.

- **`lib/main.js` — YAML parse error and schema violation collapse to one DECISION code.** Both return `{ok: false}` from `loadConfig`, and main maps both to `fail-schema-invalid`. An operator with a YAML typo sees the misleading message "schema violation". Either split into `kind: 'yaml' | 'schema'` and dispatch to `fail-config-syntax` vs `fail-schema-invalid`, or soften the operator-facing message to "config invalid". Source: Task 5 code-review I2.

---

## Test infrastructure

### Important

- **`MOCK_NO_GH_API` removes GH-write coverage in CI.** Task 12 added this seam to bypass `pulls.update` + `ensureComment` + `fetchPrTitle` so act tests run without GitHub API calls. The act tests now validate only the decision logic + Jira integration, not the GH write paths. Either add octokit-mock-based unit tests for the bypassed paths, or accept the gap and rely on Task 14's fixture-repo smoke (against real Jira + real GH) as the integration test. Source: Task 12 deviation.

### Minor

- **`fixtures/config-cases/warn-only-config.yml` named in Task 7's plan but never created.** Plan describes it as "for now just a reference; pre-existing schema test exercise." Either delete the mention from the plan or add a 3-liner config that exercises warn-only validation. Source: Task 7 code-review M6.

- **`package.json` — `express` is a runtime dependency only because of test fixtures.** Task 12 added `express@^5` to root `dependencies` to fix CI's mock-server boot. Express is only used by `fixtures/jira-mock/server.js`. Move back to `fixtures/jira-mock/package.json` and add `cd fixtures/jira-mock && npm ci` to the CI workflow's mock-boot step. Reduces consumer-install size. Source: Task 12 deviation.

- **`.github/workflows/test-pr-title-jira.yml` is a duplicate workflow.** Exists because act can't trigger the production workflow's `workflow_call`. Decide whether it's permanent (acceptable — it's act-only and won't fire on real PRs) or to fold back into `pr-title-jira.yml` with a multi-trigger setup. Source: Task 12 deviation.

---

## Documentation (`docs/`)

### Important

- **`docs/consumer-setup.md` + `docs/rollout-guide.md` — 256-char truncation behavior is undocumented.** Step 10's truncation note in the success comment will surprise consumers who haven't read the code. Add a short bullet ("Titles whose `{key}: {title}` exceeds 256 chars are truncated with `…`; full text preserved in the Jira description"). Source: Task 11 docs-review Important #1.

- **`docs/consumer-setup.md` — `JIRA_BASE_URL` override knob is undocumented.** The reusable workflow accepts `vars.JIRA_BASE_URL` for sandbox/test instances. Add a §6 "Advanced" section noting consumers can set this as a repo or org variable. Source: Task 11 docs-review Important #3.

- **`docs/rollout-guide.md` — failure-comment headings don't match what the code actually emits.** Docs quote `"Failed to create Jira ticket: 401 Unauthorized"` but `lib/jira.js` builds the message from Jira's `errorMessages` array, so "Unauthorized" never appears verbatim. Same for the 503 message. Either soften headings to "401 errors / 404 errors / 5xx errors" or quote the actual format with `${status}` placeholders. Source: Task 11 docs-review Important #4.

- **`docs/consumer-setup.md` — `description_template` config key is unmentioned.** Supported by schema + code + the example fixture (`fixtures/example-jira-title.yml`), but the consumer-facing doc never tells a reader they can customize the Jira-ticket body. Add a brief mention. Source: Task 11 docs-review Important #5.

### Minor

- **`docs/architecture.md` references files that don't exist yet at this commit.** `scripts/test-schema.js` ✓; `.github/workflows/ci.yml` ✓ (now exists post-Task 12); `somewear-labs/github-actions-fixture` ✗ (Task 14 not started). Once Task 14 lands, the forward reference resolves. Until then, the architecture page promises a fixture repo that isn't there. Wrap the test-strategy bullets in "Target end-state:" framing or defer them until 14. Source: Task 11 docs-review Important #2.

- **`docs/consumer-setup.md` hard-codes `@theo-gordon`.** Duplicated from `.github/CODEOWNERS`. Link to CODEOWNERS instead so there's one source of truth. Source: Task 11 docs-review Minor #9.

- **`docs/rollout-guide.md` — missing JIRA_API_TOKEN behavior is undocumented.** When the secret is unset entirely (repo not on allowlist), the reusable workflow fails at the workflow-syntax level (`secrets: JIRA_API_TOKEN: required: true`), never reaching the action's own 401 path. Operators looking at PR comments won't find an explanation — they need to check workflow logs. Add a sentence. Source: Task 11 docs-review Minor #10.

- **`docs/architecture.md` — "~300 LOC" is light.** `wc -l lib/*.js` is now ~365. Either bump to "~350" or drop the line count entirely. Source: Task 11 docs-review Minor #6.

- **`CHANGELOG.md` — `[Unreleased]` and `[Pending v1.0.0]` are redundant.** Fold once Task 14/15 actually ship a v1.x feature. Source: Task 11 docs-review Minor #8.

---

## Release-process artifacts

### Minor

- **`v1.0.0` tag points one commit BEFORE the CHANGELOG release entry.** Tag is at `a7cff7c` (last fix commit). CHANGELOG bump is at `af7c341`. Consumers cloning at `v1.0.0` won't see the `## [1.0.0] - 2026-05-26` entry. Either move the tag forward (`git tag -f v1.0.0 af7c341 && git tag -f v1 af7c341 && git push --force origin v1.0.0 v1`) or leave as-is. Plan-flow ordering caused this; non-critical. Source: Task 12 ordering.

---

## Repo-level polish (carried from Task 1 deferrals)

These were flagged in the original Task 1 review and parked. None block pilot but they're standard pre-pilot hygiene:

- Branch protection on `main` (require PR + at least the `schema` and `act` CI checks).
- `LICENSE` file (the README references `UNLICENSED`; pick a license or leave it).
- `SECURITY.md` (vulnerability-disclosure policy).
- Enable secret-scanning + push protection on the repo.

---

## How to process

When you sit down to work this list, the suggested order is:

1. Library `Important` items first — they're code-correctness or operator-UX bugs.
2. Documentation `Important` items — fix accuracy before any consumer reads the docs.
3. Test-infrastructure `Important` (the GH-write coverage gap) — decide direction: more mocks vs. rely on fixture-repo smoke.
4. Bundle the `Minor` items into one cleanup commit per file.
5. Repo-level polish — usually best as separate PRs since they're not code changes.
