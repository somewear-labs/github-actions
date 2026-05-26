# PR-Title Jira-Key GitHub Action — design

**Status:** Spec drafted 2026-05-26 from brief at `docs/superpowers/briefs/2026-05-19-pr-title-jira-action-brief.md`. Revised 2026-05-26 in response to review feedback on PR #146 (idempotency regex, draft-state check + concurrency, title-truncation; plus a framing update — Pulse dropped its GitHub-side integration on 2026-05-21, so the downstream consumer is now Jira's native PR-detection rather than Pulse's parser).
**Repo home:** `somewear-labs/github-actions`. Migrated from Pulse on the date of repo scaffold (see git log on this file). A stub pointer remains in Pulse for cross-reference convenience.
**Sibling to:** Pulse release-tracking sub-project #2 (merged to `main`). The downstream consumer of this Action is **Jira's native PR-detection** (the Development panel on tickets), not Pulse — see "Why this exists" for the relevant history.

## Why this exists

PR-sampling reconnaissance across six Somewear repos showed orphan-PR rates (PRs whose titles lack a Jira issue key) ranging from 12% (`ataklibs`, healthy mobile-lib repo) to 96% (`kitava`, `beam`). The original framing of this work was that Pulse's release-tracking #2 needed PR titles to carry Jira keys so it could cross-link PRs to release tickets — and rather than build an after-the-fact orphan-audit page in Pulse, we'd solve hygiene at the source.

During #2's beta verification, that framing shifted (commit `15f3b37`, 2026-05-21): **Pulse dropped its entire GitHub-side integration** (`github-reconcile.ts`, `pr_jira_links`, GitHub App, webhook). With this Action enforcing keys-in-titles, Jira's **native** Development panel already covers the PR cross-link need on a per-ticket basis — adding a Pulse-side mirror was operational surface (App, secrets, Cloudflare Access bypass) without proportional value. Pulse's release contents view is Jira-fixVersion-driven, period.

So the Action's downstream consumer is **Jira's own PR-detection**, which scans PR titles, branches, and commit messages for keys matching `[A-Z][A-Z0-9]+-\d+` anywhere in the text. Any PR whose title contains a key shows up on that ticket's Development panel; the Action's job is to ensure that's 100% of merged PRs in opted-in repos.

The result: 100% of PRs in opted-in repos end up with a Jira ticket associated, automatically, surfaced via Jira's Development panel.

## Goals

- Run as a **reusable workflow** in a central repo (`somewear-labs/github-actions`), referenced by consumer repos via `uses:` — one place to update, ref-pinning per consumer.
- Trigger on PR events that indicate "this PR is meant for review" — specifically `opened` (non-draft) and `ready_for_review`. Do not trigger on draft creation, edits, or close.
- Create a Jira ticket in the consumer's configured target project, prepend its key to the PR title, comment with a link. Idempotent — never duplicate-create when the title already contains a Jira key (matched anywhere in title, in line with Jira's PR-detection).
- Fail loudly on misconfiguration (4xx errors), gracefully on transient outages (5xx errors). Never block a developer's merge on a downstream Jira outage by default; consumers can opt in to a required-check gate via branch protection if they want one.
- Provide per-repo `mode: warn-only` for rollout — the Action runs but does not call Jira; instead it posts a comment showing what it *would* have done. Pods can preview behavior before flipping to `mode: active`.
- Be hygiene-aware: ignore configured bot authors (Dependabot, Renovate, etc.) and external (non-org-member) contributors.

## Downstream contract — do not break

The Action's downstream consumer is **Jira's native PR-detection** (Development panel on tickets). Jira scans PR titles, branches, and commit messages for keys matching `[A-Z][A-Z0-9]+-\d+` **anywhere in the text** — not just at the start.

The Action's **only** obligation is: every PR title in opted-in repos contains a Jira issue key. Standard placement is a `<KEY>: ` prefix at the start of the title, but mid-title keys are equally valid to Jira's parser and the Action must treat them as such (see §"Data flow", step 3 — idempotency check uses an anywhere-in-title match).

If a future design change to the Action would alter the key format or skip the title-edit step, coordinate with the Jira admin (key-format change) and with downstream consumers — currently Jira's Development panel; potentially future Pulse re-integration — before merging. No shared code, no shared config, no API; the contract is purely the title-contains-a-key convention.

## Scope

**In scope (this PR):**

- A new public-within-org repo `somewear-labs/github-actions`.
- One reusable workflow at `.github/workflows/pr-title-jira.yml` implementing the behavior below.
- A JSON Schema at `schema/jira-title.schema.json` for editor validation of per-repo config.
- Documentation: `README.md`, `docs/consumer-setup.md`, `docs/rollout-guide.md`.
- A fixture-repo integration test setup using `act` for local runs and a small private fixture repo (`somewear-labs/github-actions-fixture`) for end-to-end validation.
- A pilot wire-up PR in `somewear-labs/ataklibs` adding `.github/jira-title.yml` and a caller workflow.

**Explicitly out of scope:**

- Issue-type inference from labels/branch prefix (e.g. `bug/` → Bug). YAGNI; opt-in fields can be added later without schema breakage.
- Components, fix-version, sprint, custom-field population on the Jira ticket.
- Assignee mapping from GitHub author to Jira account (tickets are created unassigned in v1; the PR author appears in the description).
- A backing database / state store. The Action is stateless; title-prefix detection is the source of truth for "this PR already has a ticket."
- Re-firing on `pull_request: edited` to re-add a removed key. If a human edits the title to remove the prefix, that is the human's authoritative statement.
- Closing the auto-created ticket when the PR is closed without merge. Stale tickets are filterable via the `auto-created-from-pr` label; pods can build a Jira automation later.
- Per-repo `disable_title_edit` config (would break the downstream-Jira contract for PRs that *had* a key removed; intentionally not configurable).
- Org-wide default enable. The Action is per-repo opt-in, gated on a `.github/jira-title.yml` config file being present.
- `somewear-labs/lora_basics_modem` rollout (team pushes directly; no PR flow to hygiene-fix).

## Architecture

```
                  somewear-labs/github-actions  (new repo, owner: theo)
                  ┌──────────────────────────────────────────────────────┐
                  │  .github/workflows/pr-title-jira.yml  (reusable)     │
                  │  schema/jira-title.schema.json                       │
                  │  docs/consumer-setup.md                              │
                  │  docs/rollout-guide.md                               │
                  └──────────────────────────────────────────────────────┘
                                          ▲
                                          │ uses: somewear-labs/github-actions/
                                          │       .github/workflows/pr-title-jira.yml@v1
                                          │
   ┌──────────────────────────────────────┴───────────────────────────┐
   │  consumer repo (e.g. ataklibs, hazels, souvla, beam, kitava)     │
   │                                                                    │
   │  .github/workflows/jira-title.yml      (caller, ~10 lines)        │
   │  .github/jira-title.yml                (per-repo config)          │
   └──────────────────────────────────────────────────────────────────┘
                                          │
                                          │ pull_request_target:
                                          │   types: [opened, ready_for_review]
                                          ▼
                       ┌────────────────────────────────────┐
                       │ Reusable workflow runs:            │
                       │   1. load + validate config        │
                       │   2. early-exit checks             │
                       │   3. call Jira REST API            │
                       │   4. compare-and-swap re-check     │
                       │   5. edit PR title, post comment   │
                       └────────────────────────────────────┘
                                          │
                  ┌───────────────────────┼───────────────────────┐
                  ▼                       ▼                       ▼
            Jira REST API           GitHub REST API         PR comment
            (create issue)          (read/edit PR title)
```

**Identity:** Action authenticates to Jira as a dedicated service account `pulse-bot@somewearlabs.com` using a Jira API token. To GitHub, the Action uses the workflow's default `${{ secrets.GITHUB_TOKEN }}` with `pull-requests: write` permission.

**Secret storage:** The Jira token is an **org-level secret** `JIRA_API_TOKEN` on `somewear-labs`, scoped to the explicit list of consumer repos. Single secret to rotate; adding a new consumer is an allowed-repos list update on the org secret.

**Event:** `pull_request_target` (not `pull_request`). Reasoning: secrets are exposed to `pull_request_target` even on fork PRs, and the workflow runs against the base ref (we never check out or execute PR-author code, so the classic `pull_request_target` security risk does not apply). In practice fork PRs against private Somewear repos are vanishingly rare, but the choice is principled.

## Components

```
somewear-labs/github-actions/
├── .github/
│   └── workflows/
│       └── pr-title-jira.yml         # the reusable workflow (entry point)
├── schema/
│   └── jira-title.schema.json        # JSON Schema for consumer config
├── docs/
│   ├── consumer-setup.md             # how to wire up in a consumer repo
│   ├── rollout-guide.md              # warn-only → active flow, troubleshooting
│   └── architecture.md               # link to this spec + key decisions
├── fixtures/
│   └── example-jira-title.yml        # template consumers can copy
├── README.md
├── CHANGELOG.md
└── .github/CODEOWNERS                # designates owner (theo)
```

**Implementation form:** A single reusable workflow YAML containing one `actions/github-script@v7` step with inline JavaScript. Rationale:

- No build step, no `dist/` to maintain, all logic in one auditable file.
- The Action is small (~200-300 lines of JS) — read PR title, validate config, call Jira REST, edit PR title, comment.
- Testing is integration-first (`act` + fixture repo), so we don't gain test isolation by splitting into a separate JS-action package.
- If the Action grows beyond ~500 lines or sprouts multiple workflow steps, refactor to a standalone JS action.

**Consumer wire-up.** Each consumer repo gets two files:

1. `.github/jira-title.yml` (per-repo config — see schema below).
2. `.github/workflows/jira-title.yml` (caller workflow):

   ```yaml
   name: Jira Title
   on:
     pull_request_target:
       types: [opened, ready_for_review]
   permissions:
     pull-requests: write
   concurrency:
     # Serialize runs per PR to prevent races between opened-then-marked-ready
     # firing both events near-simultaneously, or any future trigger we add.
     # cancel-in-progress: false → second run waits, then short-circuits on
     # the idempotency check (title already has a key). Mid-Jira-call kills
     # would leak half-created tickets.
     group: jira-title-${{ github.event.pull_request.number }}
     cancel-in-progress: false
   jobs:
     jira-title:
       uses: somewear-labs/github-actions/.github/workflows/pr-title-jira.yml@v1
       secrets:
         JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
   ```

## Per-repo config schema

File: `.github/jira-title.yml`

```yaml
# Required
jira:
  project: SBE                              # required — target Jira project key

# Optional, with defaults
  issue_type: Task                          # default: Task

mode: active                                # active | warn-only — default: active

ignore_authors:                             # bot accounts that shouldn't trigger
  - dependabot[bot]
  - renovate[bot]
  - github-actions[bot]

labels:                                     # additive on top of auto-created-from-pr
  - backlog

description_template: |                     # default shown — overridable
  Auto-created from PR: {{pr_url}}
  Author: @{{github_login}}
  Repo: {{repo_full_name}}

  ---

  {{pr_body}}
```

**Template variables:** `{{pr_url}}`, `{{pr_title}}`, `{{pr_body}}`, `{{pr_number}}`, `{{github_login}}`, `{{repo_full_name}}`.

**Schema validation:** The Action validates config against `schema/jira-title.schema.json` (published in the github-actions repo) on every run. Invalid config → 4xx-tier failure (red check + comment explaining the violation). Consumer-setup docs recommend adding the YAML-language-server magic comment so editors validate against the same schema:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/somewear-labs/github-actions/v1/schema/jira-title.schema.json
```

**Fields deliberately excluded from v1:**

- `assignee_strategy` — assignee is always unassigned in v1.
- `target_branch_filter` — YAGNI; consumer repos all target `main`.
- `disable_title_edit` — would break the downstream-Jira contract; intentionally not configurable.
- `jira_url` — domain is global (`somewearlabs.atlassian.net`).
- `components`, `fix_version`, `sprint` — not needed for v1; Jira reorg (SBE consolidation) makes these unstable to design now.

## Data flow

On each `pull_request_target` event firing on `opened` or `ready_for_review`:

0. **Draft filter.** If the event is `opened` and `pull_request.draft == true` → no-op exit 0. The Action does not act on drafts; the dev will get a real run when they mark the PR ready-for-review. (This is the JS-side enforcement of the "Out" draft policy — the workflow YAML's `types: [opened, ready_for_review]` triggers on both events regardless of draft state, so the check must be in code.)
1. **Load config.** Read `.github/jira-title.yml` from the PR's **base ref** (not the head — head could be from a fork; reading base-ref also enforces that config changes must be merged before they take effect, which is the right security posture). Validate against JSON schema.
   - On schema error → 4xx-tier failure (red check + PR comment explaining the violation), `exit 1`.
   - On file missing on the base ref → no-op exit 0. (Repo has not opted in.) **Note:** a wire-up PR that adds the config file for the first time cannot run the Action on itself; only the *next* PR after merge benefits. This is intentional and accepted.
2. **Check author ignore list.** If `pull_request.user.login ∈ config.ignore_authors` → no-op exit 0.
3. **Idempotency check.** If PR title contains a key matching `\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b` **anywhere in the title** → no-op exit 0. This matches Jira's own PR-detection: a key in any position (prefix, mid-title, suffix) means the PR is already linked to that ticket via Jira's Development panel. The Action does not normalize mid-title keys to the front — the human's title intent wins. Examples that all skip:
   - `SBE-1500: Fix login` (standard prefix)
   - `ABC-123 Fix login` (prefix without colon — Jira still detects)
   - `Fix ABC-123 regression` (mid-title key)
   - `Bumping deps for ABC-123` (trailing key)
4. **External-contributor guard.** If PR author is **not** a member of `somewear-labs` org → post comment "Skipping ticket creation for external contributor `@{{login}}`." (idempotent — skip if such a comment already exists from this Action) → exit 0. Cheap defensive check; should be a near-no-op for private repos.
5. **Warn-only short-circuit.** If `config.mode == warn-only` → post comment "I would have created a `{{project}}` ticket here. Set `mode: active` in `.github/jira-title.yml` to enable." (idempotent — skip if such a comment already exists from this Action) → exit 0.
6. **Create Jira ticket** via `POST /rest/api/3/issue`. Body uses config's `issue_type`, `project`, `labels` (+ implicit `auto-created-from-pr`), and rendered `description_template`.
   - On 4xx (401 auth, 403 forbidden, 400 schema mismatch, 404 project not found) → 4xx-tier failure (red check + PR comment with sanitized error), `exit 1`.
   - On 5xx / 429 / network timeout → retry 3× with exponential backoff (1s, 2s, 4s). On final failure → PR comment "Temporary Jira issue, please add a key manually" → `exit 0`. The PR proceeds without a key; the merged PR will not show up in any Jira ticket's Development panel (orphan from Jira's perspective).
7. **Compare-and-swap re-check.** Re-fetch PR title from GitHub API.
   - If title now contains a Jira key anywhere (per the step-3 regex) → a human won the race; **no-op the title edit** but **log the leaked Jira ticket** (visible in workflow logs for manual cleanup). `exit 0`.
8. **Compute new title with truncation if needed.** GitHub enforces a 256-character limit on PR titles; a naive prepend can overflow, causing the PATCH to fail *after* the Jira ticket is already created — orphaning the ticket and leaving a red check.
   - Let `prefix = "<KEY>: "` (typically 8-12 chars).
   - If `len(prefix) + len(original_title) <= 256` → `new_title = prefix + original_title`. No truncation.
   - Else → reserve 1 char for an ellipsis: `max_original = 256 - len(prefix) - 1`. Truncate: `truncated = original_title[:max_original].rstrip() + "…"`. (Single-char `…`, not `...`. `rstrip()` to avoid trailing whitespace mid-cut.) Then `new_title = prefix + truncated`. Note the truncation occurred — surface it in step 10's comment.
   - Side effect: the Jira ticket's `summary` (created in step 6 from the original title) may also exceed Jira's 255-char limit. Apply the same truncation rule for `summary` when calling `POST /rest/api/3/issue`, but keep the original full title in the rendered `description_template` via the `{{pr_title}}` variable so nothing is lost.
9. **Edit PR title** via `PATCH /repos/{owner}/{repo}/pulls/{number}` to `new_title`.
10. **Post PR comment** with the ticket URL and the ticket key. Format: `Created [<KEY>](<ticket-url>) and prepended to title.` If a truncation occurred in step 8, append: ` (Original title exceeded GitHub's 256-char limit and was truncated; full text preserved in the ticket description.)`
11. `exit 0`.

## Error handling

| Failure class | Examples | Behavior | Status check |
|---|---|---|---|
| **4xx-tier** (configuration / programmer error) | Invalid YAML, schema violation, missing required field, Jira 400/401/403/404 | Red check, PR comment with sanitized error message, `exit 1`. Loud — needs human attention. | Fails. Pods can opt in to gate merge via branch protection. |
| **5xx-tier** (transient external failure) | Jira 5xx, 429, network timeout | Retry 3× with backoff. On final failure: PR comment notifying the human, `exit 0`. | Passes. |
| **Race-loss** (compare-and-swap re-check finds a human-added key) | Human pasted a key while Action was running | Skip title edit; log the orphan Jira ticket. | Passes. |
| **Pre-existing key** (idempotent re-run) | Action re-fires on the same PR for any reason | No-op exit 0. | Passes. |
| **Author in `ignore_authors`** | Dependabot, Renovate | No-op exit 0. No comment. | Passes. |
| **External contributor** | PR author not in org | Skip; light explanatory comment. | Passes. |
| **No config file** | Repo hasn't opted in | No-op exit 0. | Passes. |

**Branch protection:** The Action is **never** set as a required check by default. Consumer repos that want to gate merges on the check can configure branch protection themselves.

**Logging:** Workflow logs include redacted versions of every Jira request/response, the loaded config (with secrets masked), and the title before/after edit. Log level is verbose enough that a pod lead can diagnose most failures without re-running.

## Testing

**Local (developer-loop):**

- `act` runs the reusable workflow against synthetic `pull_request_target` event JSON fixtures in `fixtures/events/`. Covered paths:
  - `happy-create` — opened, non-draft, no key, valid config → ticket created + title edited + comment posted.
  - `idempotent-skip-prefix` — opened with `SBE-100: foo` → no-op.
  - `idempotent-skip-no-colon` — opened with `ABC-123 Fix login` (key present, no colon — Jira detects, Action must too) → no-op. **Regression fixture for review item 1.**
  - `idempotent-skip-mid-title` — opened with `Fix ABC-123 regression` (mid-title key) → no-op. **Regression fixture for review item 1.**
  - `idempotent-skip-trailing` — opened with `Bumping deps for ABC-123` (trailing key) → no-op.
  - `draft-opened` — opened with `draft: true` → no-op (step 0). **Regression fixture for review item 2.**
  - `ignore-author` — opened by `dependabot[bot]` → no-op.
  - `warn-only` — opened, no key, `mode: warn-only` → comment only, no Jira call.
  - `external-contributor` — opened by non-org-member → skip comment, no Jira call.
  - `schema-invalid` — config violates JSON schema → 4xx-tier failure.
  - `jira-4xx` — Jira returns 401/403/404 → 4xx-tier failure.
  - `jira-5xx-then-success` — Jira returns 503 twice, then 201 → success.
  - `race-loss` — CAS re-check finds a key added by a parallel run → leak-log + skip title edit.
  - `long-title` — opened with a 250-char title; verifies the prepend + ellipsis truncation. **Regression fixture for review item 4.**
- Jira API is mocked via a small local HTTP fixture (`fixtures/jira-mock/`) that simulates `POST /rest/api/3/issue` responses.
- GitHub API is mocked via `act`'s built-in support.

**Fixture-repo integration:**

- A new private repo `somewear-labs/github-actions-fixture` with one source file and the consumer wire-up files installed. Used to fire real `pull_request_target` events against a real (sandbox) Jira project.
- Sandbox Jira project: created during implementation as a dedicated test project (provisional key: `BOT`) where pulse-bot has create permission. Used by fixture-repo integration tests; not consumed by any real consumer repo.
- Smoke test before each release: open a fixture PR, observe ticket creation + title edit + comment.

**Pilot validation (in `ataklibs`):**

- Open the wire-up PR with `mode: warn-only`.
- Verify a real PR run posts the warn-only comment with the expected `{{project}}` placeholder filled.
- Pod lead reviews comment volume and the proposed behavior.
- Open a follow-up small PR flipping `mode: active`.
- Verify the next live PR (post-flip) gets a real ticket with the expected fields, has its title edited, and gets the link comment.
- Verify the ticket's `auto-created-from-pr` label and the description renders correctly.

## Versioning and maintenance

- **SemVer** for releases. Moving `v1` major tag (à la `actions/checkout@v4`) so consumers pin `@v1` and get patches automatically. `v1.2.0`-style immutable tags also available for paranoid consumers.
- **CHANGELOG.md** maintained by hand at the repo root.
- **Owner:** theo (designated in `.github/CODEOWNERS`). Issue triage, PR reviews, version bumps.
- **Issue intake:** GitHub issues on `somewear-labs/github-actions`. Expectation: low volume.
- **Future re-owning:** if a "Platform" team materializes at Somewear, transfer CODEOWNERS to that team.

## Rollout

**Pilot order:** Start with `somewear-labs/ataklibs` (12% orphan rate, healthy hygiene → lowest blast radius if Action misbehaves). User-driven cadence for subsequent repos; no fixed schedule.

**Per-repo enablement steps:**

1. 1:1 with the pod lead to walk through Action behavior, agree on target Jira project and issue type.
2. Open consumer-side PR adding `.github/jira-title.yml` (with `mode: warn-only`) and `.github/workflows/jira-title.yml` (the caller). Pod lead is reviewer.
3. Add the consumer repo to the `JIRA_API_TOKEN` org-secret's allowed-repos list.
4. Merge the wire-up PR.
5. Observe PR events for a wait period determined by the pod lead. Warn-only comments should appear; no real tickets created.
6. Open a small follow-up PR flipping `mode: active`. Pod lead reviews.
7. Merge the flip PR. The Action is now creating tickets.

**Candidate downstream repos (deferred to user-driven cadence):** `hazels` (24%), `souvla` (94%), `beam` (96%), `kitava` (96%). `lora_basics_modem` excluded — no PR flow.

## Open items / future work

- **Assignee mapping** (`github-login → jira-account-id`). Add as opt-in config field if pods request pre-assigned tickets.
- **Issue-type inference** from branch prefix or label. Opt-in.
- **Stale-ticket cleanup** on PR-close-without-merge. Likely a Jira automation rule (consumer-side) rather than Action logic.
- **Multi-Jira-instance support.** Currently hardcoded to `somewearlabs.atlassian.net`. If Somewear ever splits across instances, lift to config.
- **Action telemetry.** A periodic summary ("N tickets auto-created this week across repos") would help judge rollout success. Could be a separate scheduled workflow that queries Jira for tickets with the `auto-created-from-pr` label.
