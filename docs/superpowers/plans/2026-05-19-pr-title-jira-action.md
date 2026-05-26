# PR-Title Jira-Key GitHub Action — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and pilot a reusable GitHub Actions workflow at `somewear-labs/github-actions` that auto-creates a Jira ticket for any PR opened (or marked ready-for-review) without a Jira key in its title, prepends the key to the title, and comments with the ticket link.

**Architecture:** Single reusable workflow YAML invoked from consumer repos via `uses:`. Workflow runs one `actions/github-script@v7` step containing inline JavaScript that loads per-repo config, validates against a JSON schema, performs early-exit guards (draft, ignored authors, key already present, external contributors, warn-only mode), creates a Jira ticket via REST, then compare-and-swaps + edits the PR title with truncation, then comments. Stateless — title prefix is the source of truth for "already ticketed."

**Tech Stack:** GitHub Actions (reusable workflows + `actions/github-script@v7`), Node 20+ (built into ubuntu-latest runner), `js-yaml` for config parsing, `ajv` + `ajv-formats` for JSON schema validation, native `fetch()` for Jira REST calls. Testing via `act` (nektos/act) running synthetic event JSON fixtures against a local Jira mock server (small Express app). Pilot consumer: `somewear-labs/ataklibs`.

**Spec:** `docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md` (hosted in Pulse repo during design; migrated to the new `somewear-labs/github-actions` repo by Task 1).

---

## File structure (target end state in `somewear-labs/github-actions`)

```
somewear-labs/github-actions/
├── .github/
│   ├── workflows/
│   │   ├── pr-title-jira.yml          # the reusable workflow (entry point)
│   │   └── ci.yml                      # self-CI (schema lint + act smoke tests)
│   └── CODEOWNERS
├── schema/
│   └── jira-title.schema.json         # AJV-compatible JSON Schema for per-repo config
├── docs/
│   ├── consumer-setup.md              # how to wire up in a consumer repo
│   ├── rollout-guide.md               # warn-only → active flow, troubleshooting
│   ├── architecture.md                # link to spec + key decisions
│   └── superpowers/specs/2026-05-19-pr-title-jira-action-design.md  # migrated from Pulse
├── fixtures/
│   ├── example-jira-title.yml         # template config consumers copy
│   ├── events/                        # synthetic pull_request_target payloads
│   │   ├── happy-create.json
│   │   ├── idempotent-skip-prefix.json
│   │   ├── idempotent-skip-no-colon.json
│   │   ├── idempotent-skip-mid-title.json
│   │   ├── idempotent-skip-trailing.json
│   │   ├── draft-opened.json
│   │   ├── ignore-author.json
│   │   ├── warn-only.json
│   │   ├── external-contributor.json
│   │   ├── schema-invalid.json
│   │   ├── jira-4xx.json
│   │   ├── jira-5xx-then-success.json
│   │   ├── race-loss.json
│   │   └── long-title.json
│   └── jira-mock/
│       ├── package.json
│       ├── server.js                  # Express mock; selects scenario via header
│       └── scenarios.js               # canned responses keyed by scenario name
├── README.md
├── CHANGELOG.md
├── .gitignore
└── package.json                       # for jira-mock + lint deps; not referenced by workflow
```

**Files outside this repo, also created/modified by the plan:**

- `somewear-labs/github-actions-fixture/.github/jira-title.yml` (new repo created in Task 14)
- `somewear-labs/github-actions-fixture/.github/workflows/jira-title.yml` (caller, in same repo)
- `somewear-labs/ataklibs/.github/jira-title.yml` (Task 15 — pilot)
- `somewear-labs/ataklibs/.github/workflows/jira-title.yml` (Task 15 — pilot)
- `somewear-labs/pulse/docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md` (Task 1 leaves a stub pointer here after migration)
- GitHub org secret `JIRA_API_TOKEN` scoped to consumer repos (Task 13 — operational, no code)

---

## Conventions for all tasks

- Commit message format: conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`).
- Each task ends with a commit before moving on.
- Working directory throughout Tasks 1-13 is the newly-cloned `somewear-labs/github-actions` repo (created in Task 1).
- Working directory for Task 14 is the fixture repo; Tasks 15-16 are the `ataklibs` repo.
- The agent owner of the new repo is the human user (CODEOWNERS = `@theo-gordon` — verify exact GitHub login on first contact).

---

## Task 1: Scaffold `somewear-labs/github-actions` and migrate spec

**Files:**
- Create: `somewear-labs/github-actions` (new GitHub repo)
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `.gitignore`
- Create: `.github/CODEOWNERS`
- Move: spec from Pulse `docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md` to the new repo at same path
- Modify: Pulse spec replaced with a stub pointer

- [ ] **Step 1: Create the GitHub repo**

Run:
```bash
cd ~/Documents/Repos   # parent dir of the existing pulse checkout
gh repo create somewear-labs/github-actions \
  --private \
  --description "Reusable GitHub Actions workflows for somewear-labs (starting with PR-title Jira-key auto-creation)" \
  --clone
cd github-actions
```
Expected: `Created repository somewear-labs/github-actions on GitHub` and a local clone in `~/Documents/Repos/github-actions`.

- [ ] **Step 2: Write README.md**

Create `README.md`:
```markdown
# somewear-labs/github-actions

Reusable GitHub Actions workflows for `somewear-labs` repositories.

## Workflows

- [`pr-title-jira.yml`](.github/workflows/pr-title-jira.yml) — Auto-creates a Jira ticket for any PR opened (or marked ready-for-review) without a Jira key in its title, prepends the key to the title, and comments with the ticket link.

## Consumer setup

See [`docs/consumer-setup.md`](docs/consumer-setup.md).

## Rollout

See [`docs/rollout-guide.md`](docs/rollout-guide.md).

## Design

See [`docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md`](docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md).
```

- [ ] **Step 3: Write CHANGELOG.md**

Create `CHANGELOG.md`:
```markdown
# Changelog

All notable changes to this repo's workflows are documented here. Versioned per [SemVer](https://semver.org/).

## [Unreleased]

- Initial scaffold.
```

- [ ] **Step 4: Write .gitignore**

Create `.gitignore`:
```
node_modules/
*.log
.DS_Store
.act/
```

- [ ] **Step 5: Write CODEOWNERS**

Create `.github/CODEOWNERS`:
```
*       @theo-gordon
```

- [ ] **Step 6: Migrate the spec and plan from Pulse**

From the new repo's working directory (`~/Documents/Repos/github-actions`):
```bash
mkdir -p docs/superpowers/specs docs/superpowers/plans
cp ../pulse/docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md \
   docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md
cp ../pulse/docs/superpowers/plans/2026-05-19-pr-title-jira-action.md \
   docs/superpowers/plans/2026-05-19-pr-title-jira-action.md
```
Then update the spec's "Repo home" line in its new location. Open the file and replace:
```
**Repo home:** This spec will live in a new repo `somewear-labs/github-actions`. It is temporarily hosted in Pulse alongside the sibling sub-project #2 spec (`2026-05-17-release-contents-github-jira-design.md`) for ease of cross-reference during design. The implementation plan's first task is to scaffold `somewear-labs/github-actions` and migrate this spec there.
```
with:
```
**Repo home:** `somewear-labs/github-actions`. Migrated from Pulse on the date of repo scaffold (see git log on this file). A stub pointer remains in Pulse for cross-reference convenience.
```

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "chore: initial scaffold + migrate design spec from Pulse"
git push -u origin main
```
Expected: commit lands on `main` of the new repo.

- [ ] **Step 8: Replace Pulse spec and plan with stub pointers**

Switch back to the Pulse repo working directory (`~/Documents/Repos/pulse`, branch `feature/pr-title-jira-action-spec-v2` — the canonical PR branch).

Overwrite `docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md` with:
```markdown
# PR-Title Jira-Key GitHub Action — design (moved)

This spec has moved to its home repo:

**[`somewear-labs/github-actions/docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md`](https://github.com/somewear-labs/github-actions/blob/main/docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md)**

It was hosted here during design alongside the sibling Pulse release-tracking #2 spec for cross-reference convenience. After the `somewear-labs/github-actions` repo was scaffolded, the canonical copy moved there.
```

Overwrite `docs/superpowers/plans/2026-05-19-pr-title-jira-action.md` with:
```markdown
# PR-Title Jira-Key GitHub Action — plan (moved)

This implementation plan has moved to its home repo:

**[`somewear-labs/github-actions/docs/superpowers/plans/2026-05-19-pr-title-jira-action.md`](https://github.com/somewear-labs/github-actions/blob/main/docs/superpowers/plans/2026-05-19-pr-title-jira-action.md)**
```

- [ ] **Step 9: Commit the Pulse-side stubs**

```bash
cd ~/Documents/Repos/pulse
git add docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md \
        docs/superpowers/plans/2026-05-19-pr-title-jira-action.md
git commit -m "docs: replace migrated PR-title Jira Action spec + plan with stub pointers"
git push
```
Expected: PR #149 receives a new commit. The PR can be merged or closed at the user's discretion.

---

## Task 2: Local test harness (act + Jira mock + fixture format)

**Files:**
- Create: `fixtures/jira-mock/package.json`
- Create: `fixtures/jira-mock/server.js`
- Create: `fixtures/jira-mock/scenarios.js`
- Create: `fixtures/events/_template.md` (event-fixture format guide)
- Create: `package.json` (root, for dev deps + scripts)

Working dir for this task and the next 11: the `github-actions` repo (cloned in Task 1).

- [ ] **Step 1: Initialize root package.json**

```bash
npm init -y
```
Then edit `package.json` so `name` is `somewear-labs-github-actions`, `private` is `true`, and add scripts:
```json
{
  "scripts": {
    "test:schema": "node scripts/test-schema.js",
    "test:act": "scripts/run-act-tests.sh",
    "test": "npm run test:schema && npm run test:act",
    "mock:jira": "node fixtures/jira-mock/server.js"
  }
}
```
(Scripts referenced here are created in later tasks; this just reserves the entry points.)

- [ ] **Step 2: Install act locally and verify**

Run:
```bash
brew install act     # macOS; Linux: see https://github.com/nektos/act
act --version
```
Expected: a version number (e.g. `act version 0.2.x`).

- [ ] **Step 3: Initialize the Jira mock package**

```bash
mkdir -p fixtures/jira-mock
cd fixtures/jira-mock
npm init -y
npm install express@4
cd ../..
```

- [ ] **Step 4: Write the mock server**

Create `fixtures/jira-mock/server.js`:
```javascript
const express = require('express');
const scenarios = require('./scenarios');

const app = express();
app.use(express.json());

// Scenario is selected via X-Mock-Scenario header set by the test harness.
// Default = "happy" if not set.
function pickScenario(req) {
  return req.header('X-Mock-Scenario') || 'happy';
}

// Per-scenario retry counter (resets on server restart).
const retryCounters = new Map();

app.post('/rest/api/3/issue', (req, res) => {
  const name = pickScenario(req);
  const s = scenarios[name];
  if (!s) return res.status(500).json({ errorMessages: [`unknown scenario: ${name}`] });

  if (s.kind === 'success') {
    return res.status(201).json(s.body);
  }
  if (s.kind === 'error') {
    return res.status(s.status).json(s.body);
  }
  if (s.kind === 'flake') {
    const count = (retryCounters.get(name) || 0) + 1;
    retryCounters.set(name, count);
    if (count <= s.failTimes) {
      return res.status(s.status).json(s.body);
    }
    return res.status(201).json(s.successBody);
  }
});

app.get('/rest/api/3/myself', (req, res) => {
  // health-check endpoint used by some tests
  res.status(200).json({ accountId: 'pulse-bot-mock', displayName: 'pulse-bot (mock)' });
});

const port = process.env.JIRA_MOCK_PORT || 4111;
app.listen(port, () => console.log(`Jira mock listening on http://localhost:${port}`));
```

- [ ] **Step 5: Write the scenarios fixture**

Create `fixtures/jira-mock/scenarios.js`:
```javascript
module.exports = {
  happy: {
    kind: 'success',
    body: { id: '10001', key: 'BOT-1500', self: 'http://localhost:4111/rest/api/3/issue/10001' }
  },
  '4xx-auth': {
    kind: 'error',
    status: 401,
    body: { errorMessages: ['Unauthorized'], errors: {} }
  },
  '4xx-project-not-found': {
    kind: 'error',
    status: 404,
    body: { errorMessages: ['Project not found'], errors: {} }
  },
  '5xx-then-success': {
    kind: 'flake',
    status: 503,
    body: { errorMessages: ['Temporary failure'] },
    failTimes: 2,
    successBody: { id: '10002', key: 'BOT-1501', self: 'http://localhost:4111/rest/api/3/issue/10002' }
  },
  '5xx-permanent': {
    kind: 'error',
    status: 503,
    body: { errorMessages: ['Service unavailable'] }
  }
};
```

- [ ] **Step 6: Manual smoke of the mock**

In one terminal:
```bash
npm run mock:jira
```
Expected: `Jira mock listening on http://localhost:4111`.

In another terminal:
```bash
curl -i -X POST http://localhost:4111/rest/api/3/issue \
  -H 'Content-Type: application/json' \
  -H 'X-Mock-Scenario: happy' \
  -d '{}'
```
Expected: `HTTP/1.1 201 Created` and `{"id":"10001","key":"BOT-1500", ...}`.

```bash
curl -i -X POST http://localhost:4111/rest/api/3/issue \
  -H 'X-Mock-Scenario: 4xx-auth' -d '{}'
```
Expected: `HTTP/1.1 401 Unauthorized`.

Stop the mock (Ctrl-C).

- [ ] **Step 7: Write the event-fixture format guide**

Create `fixtures/events/_template.md`:
```markdown
# Event fixture format

Each `<name>.json` in this directory is a synthetic `pull_request_target` webhook payload used by `act` to run the reusable workflow against a known input.

Minimum fields the workflow reads:
- `action` — one of `opened`, `ready_for_review`
- `pull_request.number`
- `pull_request.draft` (boolean)
- `pull_request.title`
- `pull_request.body`
- `pull_request.html_url`
- `pull_request.base.ref`
- `pull_request.base.repo.full_name`
- `pull_request.user.login`
- `repository.full_name`
- `repository.owner.login`

To run a single fixture locally:
```
act pull_request_target \
  -e fixtures/events/happy-create.json \
  -W .github/workflows/pr-title-jira.yml \
  -s JIRA_API_TOKEN=fake-token \
  --env JIRA_BASE_URL=http://host.docker.internal:4111 \
  --env MOCK_SCENARIO=happy
```
(`host.docker.internal` lets the act container reach the host-side Jira mock.)
```

- [ ] **Step 8: Commit**

```bash
git add fixtures/jira-mock fixtures/events/_template.md package.json package-lock.json
git commit -m "test: add Jira mock server and event-fixture format guide"
```

---

## Task 3: JSON schema for per-repo config + validation tests

**Files:**
- Create: `schema/jira-title.schema.json`
- Create: `fixtures/example-jira-title.yml`
- Create: `scripts/test-schema.js`
- Create: `fixtures/config-cases/valid-minimal.yml`
- Create: `fixtures/config-cases/valid-full.yml`
- Create: `fixtures/config-cases/invalid-missing-project.yml`
- Create: `fixtures/config-cases/invalid-bad-mode.yml`
- Create: `fixtures/config-cases/invalid-extra-field.yml`

- [ ] **Step 1: Write the JSON Schema**

Create `schema/jira-title.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://raw.githubusercontent.com/somewear-labs/github-actions/v1/schema/jira-title.schema.json",
  "title": "PR-Title Jira-Key Action — per-repo config",
  "type": "object",
  "additionalProperties": false,
  "required": ["jira"],
  "properties": {
    "jira": {
      "type": "object",
      "additionalProperties": false,
      "required": ["project"],
      "properties": {
        "project": {
          "type": "string",
          "pattern": "^[A-Z][A-Z0-9]{1,9}$",
          "description": "Target Jira project key, e.g. SBE."
        },
        "issue_type": {
          "type": "string",
          "default": "Task",
          "description": "Jira issue type for auto-created tickets."
        }
      }
    },
    "mode": {
      "type": "string",
      "enum": ["active", "warn-only"],
      "default": "active"
    },
    "ignore_authors": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["dependabot[bot]", "renovate[bot]", "github-actions[bot]"]
    },
    "labels": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "description_template": {
      "type": "string",
      "default": "Auto-created from PR: {{pr_url}}\nAuthor: @{{github_login}}\nRepo: {{repo_full_name}}\n\n---\n\n{{pr_body}}"
    }
  }
}
```

- [ ] **Step 2: Write the example config**

Create `fixtures/example-jira-title.yml`:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/somewear-labs/github-actions/v1/schema/jira-title.schema.json
# Drop this in your repo at .github/jira-title.yml after customizing.

jira:
  project: SBE         # required — your target Jira project key
  issue_type: Task     # default; override if you want

mode: warn-only        # start in warn-only for rollout; flip to "active" after pod sign-off

ignore_authors:
  - dependabot[bot]
  - renovate[bot]
  - github-actions[bot]

labels:
  - backlog

# description_template uses {{pr_url}}, {{pr_title}}, {{pr_body}}, {{pr_number}},
# {{github_login}}, {{repo_full_name}}. Omit to use the default.
```

- [ ] **Step 3: Write the valid-minimal and valid-full test fixtures**

Create `fixtures/config-cases/valid-minimal.yml`:
```yaml
jira:
  project: SBE
```

Create `fixtures/config-cases/valid-full.yml`:
```yaml
jira:
  project: BAC
  issue_type: Story
mode: warn-only
ignore_authors:
  - dependabot[bot]
labels:
  - backlog
  - triage
description_template: "PR: {{pr_url}}\n@{{github_login}}"
```

- [ ] **Step 4: Write the invalid test fixtures**

Create `fixtures/config-cases/invalid-missing-project.yml`:
```yaml
jira:
  issue_type: Task
```

Create `fixtures/config-cases/invalid-bad-mode.yml`:
```yaml
jira:
  project: SBE
mode: enabled
```

Create `fixtures/config-cases/invalid-extra-field.yml`:
```yaml
jira:
  project: SBE
nonsense_field: hello
```

- [ ] **Step 5: Install schema test deps**

```bash
npm install --save-dev ajv@8 ajv-formats@3 js-yaml@4
```

- [ ] **Step 6: Write the schema test script**

Create `scripts/test-schema.js`:
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;

const schema = JSON.parse(fs.readFileSync('schema/jira-title.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const cases = [
  { file: 'fixtures/config-cases/valid-minimal.yml', expect: 'valid' },
  { file: 'fixtures/config-cases/valid-full.yml', expect: 'valid' },
  { file: 'fixtures/example-jira-title.yml', expect: 'valid' },
  { file: 'fixtures/config-cases/invalid-missing-project.yml', expect: 'invalid' },
  { file: 'fixtures/config-cases/invalid-bad-mode.yml', expect: 'invalid' },
  { file: 'fixtures/config-cases/invalid-extra-field.yml', expect: 'invalid' }
];

let failed = 0;
for (const c of cases) {
  const data = yaml.load(fs.readFileSync(c.file, 'utf8'));
  const ok = validate(data);
  const got = ok ? 'valid' : 'invalid';
  const pass = got === c.expect;
  if (!pass) {
    failed++;
    console.error(`FAIL: ${c.file} — expected ${c.expect}, got ${got}`);
    if (!ok) console.error('  errors:', JSON.stringify(validate.errors, null, 2));
  } else {
    console.log(`OK:   ${c.file} (${got})`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} schema test case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} schema test cases passed`);
```

- [ ] **Step 7: Run the schema tests and verify they pass**

```bash
chmod +x scripts/test-schema.js
npm run test:schema
```
Expected output ends with:
```
All 6 schema test cases passed
```

- [ ] **Step 8: Commit**

```bash
git add schema fixtures/example-jira-title.yml fixtures/config-cases scripts/test-schema.js package.json package-lock.json
git commit -m "feat(schema): add JSON Schema for per-repo config + validation tests"
```

---

## Task 4: Reusable workflow skeleton (entrypoint + JS scaffolding)

**Files:**
- Create: `.github/workflows/pr-title-jira.yml`
- Create: `scripts/run-act-tests.sh`
- Create: `fixtures/events/happy-create.json`

- [ ] **Step 1: Write the happy-create event fixture**

Create `fixtures/events/happy-create.json`:
```json
{
  "action": "opened",
  "number": 42,
  "pull_request": {
    "number": 42,
    "draft": false,
    "title": "Fix login race condition",
    "body": "Root cause: token race. Fix: serialize refresh.",
    "html_url": "https://github.com/somewear-labs/fixture-repo/pull/42",
    "base": {
      "ref": "main",
      "repo": { "full_name": "somewear-labs/fixture-repo" }
    },
    "user": { "login": "theo-somewear" }
  },
  "repository": {
    "full_name": "somewear-labs/fixture-repo",
    "owner": { "login": "somewear-labs" }
  }
}
```

- [ ] **Step 2: Write the workflow skeleton**

Create `.github/workflows/pr-title-jira.yml`:
```yaml
name: PR-title Jira-key (reusable)

on:
  workflow_call:
    secrets:
      JIRA_API_TOKEN:
        required: true

jobs:
  pr-title-jira:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Checkout reusable-workflow repo at the pinned ref
        # Reads schema/ and inline-script deps from this very repo at the ref
        # the consumer used (e.g. @v1). github.action_path is not available
        # in reusable workflows, so we checkout explicitly.
        uses: actions/checkout@v4
        with:
          repository: somewear-labs/github-actions
          ref: ${{ github.workflow_ref && github.workflow_ref || 'main' }}
          path: .pr-title-jira

      - name: Install runtime deps
        run: |
          cd .pr-title-jira
          npm ci --omit=dev || npm install --omit=dev js-yaml@4 ajv@8 ajv-formats@3
        shell: bash

      - name: Run PR-title-Jira logic
        uses: actions/github-script@v7
        env:
          JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
          JIRA_BASE_URL: ${{ vars.JIRA_BASE_URL || 'https://somewearlabs.atlassian.net' }}
          MOCK_SCENARIO: ${{ vars.MOCK_SCENARIO || '' }}
        with:
          script: |
            const path = require('path');
            const fs = require('fs');
            const cwd = path.join(process.env.GITHUB_WORKSPACE, '.pr-title-jira');
            process.chdir(cwd);
            const main = require(path.join(cwd, 'lib', 'main.js'));
            await main({ github, context, core });
```

- [ ] **Step 3: Create the lib/main.js skeleton**

Create `lib/main.js`:
```javascript
// Inline entry point invoked by .github/workflows/pr-title-jira.yml.
// Each numbered step from the spec's "Data flow" section is implemented
// in subsequent tasks (5-10). For now this is a no-op stub that just logs.

module.exports = async function main({ github, context, core }) {
  core.info('pr-title-jira: invoked');
  core.info(`event: ${context.eventName}, action: ${context.payload.action}`);
  core.info(`pr: #${context.payload.pull_request?.number} "${context.payload.pull_request?.title}"`);
  // Steps 0-10 fill in here in later tasks.
};
```

- [ ] **Step 4: Write the act-runner script**

Create `scripts/run-act-tests.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Runs all event fixtures through act, asserting each one's expected outcome.
# Expects the Jira mock to be running on port 4111 (npm run mock:jira).

PORT=${JIRA_MOCK_PORT:-4111}
WORKFLOW=.github/workflows/pr-title-jira.yml

# Confirm the mock is up.
if ! curl -sf "http://localhost:${PORT}/rest/api/3/myself" >/dev/null; then
  echo "ERROR: Jira mock not running on port ${PORT}. Start it with: npm run mock:jira" >&2
  exit 2
fi

# Each entry: fixture_filename:scenario:expected_status
# scenario is sent as MOCK_SCENARIO env var to the workflow (and into requests via header).
# expected_status: pass|fail
CASES=(
  "happy-create.json:happy:pass"
)
# More cases appended as later tasks add fixtures.

failed=0
for entry in "${CASES[@]}"; do
  IFS=':' read -r fixture scenario expected <<<"$entry"
  echo "=== ${fixture} (scenario=${scenario}, expect=${expected}) ==="
  if act pull_request_target \
       -e "fixtures/events/${fixture}" \
       -W "${WORKFLOW}" \
       -s JIRA_API_TOKEN=fake-token \
       --env "JIRA_BASE_URL=http://host.docker.internal:${PORT}" \
       --env "MOCK_SCENARIO=${scenario}" \
       --quiet; then
    actual=pass
  else
    actual=fail
  fi
  if [ "${actual}" != "${expected}" ]; then
    echo "FAIL: ${fixture} expected ${expected}, got ${actual}"
    failed=$((failed + 1))
  else
    echo "OK:   ${fixture}"
  fi
done

if [ "${failed}" -gt 0 ]; then
  echo "${failed} act test(s) failed"
  exit 1
fi
echo "All act tests passed"
```

- [ ] **Step 5: Make the script executable and run a smoke**

```bash
chmod +x scripts/run-act-tests.sh
npm run mock:jira &      # background the mock
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected output ends with:
```
OK:   happy-create.json
All act tests passed
```
(The workflow runs the stub `main.js`, which exits 0 — the only assertion at this stage is "act ran the workflow without erroring." Later tasks add side-effect assertions.)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/pr-title-jira.yml lib/main.js scripts/run-act-tests.sh fixtures/events/happy-create.json
git commit -m "feat(workflow): scaffold reusable workflow and act test runner"
```

---

## Task 5: Steps 0+1 — Draft filter + config loader (with schema validation)

**Files:**
- Modify: `lib/main.js`
- Create: `lib/config.js`
- Create: `fixtures/events/draft-opened.json`
- Modify: `scripts/run-act-tests.sh` (append new case)
- Modify: `scripts/test-schema.js` is unaffected; this is integration via act

- [ ] **Step 1: Write the draft-opened fixture**

Create `fixtures/events/draft-opened.json`:
```json
{
  "action": "opened",
  "number": 43,
  "pull_request": {
    "number": 43,
    "draft": true,
    "title": "WIP: refactor auth",
    "body": "",
    "html_url": "https://github.com/somewear-labs/fixture-repo/pull/43",
    "base": { "ref": "main", "repo": { "full_name": "somewear-labs/fixture-repo" } },
    "user": { "login": "theo-somewear" }
  },
  "repository": {
    "full_name": "somewear-labs/fixture-repo",
    "owner": { "login": "somewear-labs" }
  }
}
```

- [ ] **Step 2: Append the draft fixture to the act test cases (still expecting "pass" because draft = no-op exit 0)**

Edit `scripts/run-act-tests.sh`, replace the `CASES` array with:
```bash
CASES=(
  "happy-create.json:happy:pass"
  "draft-opened.json:happy:pass"
)
```

- [ ] **Step 3: Write the failing assertion that draft is filtered**

Re-running `npm run test:act` currently passes both — but the stub doesn't actually exit early on draft, it just logs. We need a side-effect to assert against. The pragmatic approach: have `main.js` write a `decision: <code>` line to `core.setOutput`, and have the act runner assert on it.

Edit `scripts/run-act-tests.sh` — replace the per-case `act` invocation with a wrapped version that captures output and greps for an expected decision marker:

```bash
CASES=(
  # fixture:scenario:expected_decision
  "happy-create.json:happy:proceed-create"
  "draft-opened.json:happy:skip-draft"
)

failed=0
for entry in "${CASES[@]}"; do
  IFS=':' read -r fixture scenario expected <<<"$entry"
  echo "=== ${fixture} (scenario=${scenario}, expect=${expected}) ==="

  LOG=$(mktemp)
  act pull_request_target \
       -e "fixtures/events/${fixture}" \
       -W "${WORKFLOW}" \
       -s JIRA_API_TOKEN=fake-token \
       --env "JIRA_BASE_URL=http://host.docker.internal:${PORT}" \
       --env "MOCK_SCENARIO=${scenario}" \
       --quiet 2>&1 | tee "$LOG"

  if grep -q "DECISION=${expected}" "$LOG"; then
    echo "OK:   ${fixture}"
  else
    echo "FAIL: ${fixture} expected DECISION=${expected}, got:"
    grep "DECISION=" "$LOG" || echo "  (no decision marker found)"
    failed=$((failed + 1))
  fi
  rm "$LOG"
done

if [ "${failed}" -gt 0 ]; then
  echo "${failed} act test(s) failed"
  exit 1
fi
echo "All act tests passed"
```

- [ ] **Step 4: Run tests, verify they fail (stub doesn't emit DECISION markers)**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act || true   # expected to fail
kill $MOCK_PID
```
Expected: both cases FAIL because `lib/main.js` doesn't emit `DECISION=` yet.

- [ ] **Step 5: Implement config loading and the draft filter**

Create `lib/config.js`:
```javascript
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;

const schemaPath = path.join(__dirname, '..', 'schema', 'jira-title.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Load and validate per-repo config from the PR's base ref.
 * Returns { found: false } if no config file, { ok: true, config } if valid,
 * { ok: false, errors } if invalid.
 */
async function loadConfig({ github, context }) {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name || context.payload.repository.full_name.split('/')[1];
  const ref = context.payload.pull_request.base.ref;

  let raw;
  try {
    const res = await github.rest.repos.getContent({
      owner, repo, path: '.github/jira-title.yml', ref
    });
    raw = Buffer.from(res.data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return { found: false };
    throw err;
  }

  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    return { ok: false, errors: [`YAML parse error: ${err.message}`] };
  }

  const ok = validate(parsed);
  if (!ok) {
    return { ok: false, errors: validate.errors.map(e => `${e.instancePath || '(root)'} ${e.message}`) };
  }
  return { found: true, ok: true, config: parsed };
}

module.exports = { loadConfig };
```

Replace `lib/main.js` with:
```javascript
const { loadConfig } = require('./config');

function decision(core, code, reason) {
  core.info(`DECISION=${code}: ${reason}`);
  core.setOutput('decision', code);
}

module.exports = async function main({ github, context, core }) {
  const pr = context.payload.pull_request;
  if (!pr) {
    decision(core, 'skip-no-pr', 'no pull_request in payload');
    return;
  }
  core.info(`pr-title-jira: PR #${pr.number} "${pr.title}" action=${context.payload.action} draft=${pr.draft}`);

  // Step 0: Draft filter
  if (context.payload.action === 'opened' && pr.draft === true) {
    decision(core, 'skip-draft', 'opened event on a draft PR');
    return;
  }

  // Step 1: Load config
  const cfg = await loadConfig({ github, context });
  if (cfg.found === false) {
    decision(core, 'skip-no-config', 'no .github/jira-title.yml on base ref');
    return;
  }
  if (cfg.ok === false) {
    decision(core, 'fail-schema-invalid', `config schema violation: ${cfg.errors.join('; ')}`);
    core.setFailed(`Config schema violation: ${cfg.errors.join('; ')}`);
    return;
  }

  // Subsequent steps (2-10) added by later tasks.
  decision(core, 'proceed-create', 'config valid, would proceed to create ticket (later tasks)');
};
```

- [ ] **Step 6: Run tests, verify they pass**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected: both cases OK.

- [ ] **Step 7: Commit**

```bash
git add lib/config.js lib/main.js scripts/run-act-tests.sh fixtures/events/draft-opened.json
git commit -m "feat(workflow): step 0 (draft filter) + step 1 (config loader + schema validation)"
```

---

## Task 6: Steps 2+3 — Author ignore + anywhere-key idempotency

**Files:**
- Modify: `lib/main.js`
- Create: `lib/jira-key.js`
- Create: `fixtures/events/ignore-author.json`
- Create: `fixtures/events/idempotent-skip-prefix.json`
- Create: `fixtures/events/idempotent-skip-no-colon.json`
- Create: `fixtures/events/idempotent-skip-mid-title.json`
- Create: `fixtures/events/idempotent-skip-trailing.json`
- Modify: `scripts/run-act-tests.sh`

- [ ] **Step 1: Write the new event fixtures**

Create `fixtures/events/ignore-author.json`: copy `happy-create.json` and set `pull_request.user.login` to `"dependabot[bot]"`.

Create `fixtures/events/idempotent-skip-prefix.json`: copy `happy-create.json` and set `pull_request.title` to `"SBE-100: Fix login race condition"`.

Create `fixtures/events/idempotent-skip-no-colon.json`: copy and set title to `"ABC-123 Fix login"`.

Create `fixtures/events/idempotent-skip-mid-title.json`: copy and set title to `"Fix ABC-123 regression in token refresh"`.

Create `fixtures/events/idempotent-skip-trailing.json`: copy and set title to `"Bumping deps for ABC-123"`.

- [ ] **Step 2: Append the cases to act test runner**

Add to `CASES` in `scripts/run-act-tests.sh`:
```bash
  "ignore-author.json:happy:skip-ignored-author"
  "idempotent-skip-prefix.json:happy:skip-has-key"
  "idempotent-skip-no-colon.json:happy:skip-has-key"
  "idempotent-skip-mid-title.json:happy:skip-has-key"
  "idempotent-skip-trailing.json:happy:skip-has-key"
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act || true
kill $MOCK_PID
```
Expected: 5 new cases FAIL (lib/main.js doesn't implement these checks yet).

- [ ] **Step 4: Write the key-detection helper**

Create `lib/jira-key.js`:
```javascript
// Matches Jira's native PR-detection: any [A-Z][A-Z0-9]{1,9}-\d{1,6} token
// at a word boundary, anywhere in the title.
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/;

function containsJiraKey(title) {
  return JIRA_KEY_RE.test(title);
}

module.exports = { containsJiraKey, JIRA_KEY_RE };
```

- [ ] **Step 5: Add the two new steps to main.js**

Replace the marker "Subsequent steps (2-10)" block in `lib/main.js`:

Find this block:
```javascript
  // Subsequent steps (2-10) added by later tasks.
  decision(core, 'proceed-create', 'config valid, would proceed to create ticket (later tasks)');
```

Replace with:
```javascript
  // Step 2: Author ignore list
  const ignored = cfg.config.ignore_authors || [];
  const author = pr.user.login;
  if (ignored.includes(author)) {
    decision(core, 'skip-ignored-author', `author ${author} is in ignore_authors`);
    return;
  }

  // Step 3: Idempotency check — key anywhere in title
  const { containsJiraKey } = require('./jira-key');
  if (containsJiraKey(pr.title)) {
    decision(core, 'skip-has-key', `title already contains a Jira key: "${pr.title}"`);
    return;
  }

  // Subsequent steps (4-10) added by later tasks.
  decision(core, 'proceed-create', 'all early checks passed; would create ticket (later tasks)');
```

- [ ] **Step 6: Run tests, verify they pass**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected: all 7 cases OK.

- [ ] **Step 7: Commit**

```bash
git add lib/main.js lib/jira-key.js fixtures/events scripts/run-act-tests.sh
git commit -m "feat(workflow): step 2 (author ignore) + step 3 (anywhere-key idempotency)"
```

---

## Task 7: Steps 4+5 — External-contributor guard + warn-only short-circuit

**Files:**
- Modify: `lib/main.js`
- Create: `lib/comments.js`
- Create: `fixtures/events/external-contributor.json`
- Create: `fixtures/events/warn-only.json`
- Create: `fixtures/config-cases/warn-only-config.yml` (committed to fixture-repo config in Task 14; for now just a reference; pre-existing schema test exercise)
- Modify: `scripts/run-act-tests.sh`

External-contributor guard requires `github.rest.orgs.checkMembershipForUser`. Warn-only requires posting a comment idempotently (search existing comments for a sentinel before posting).

- [ ] **Step 1: Write the fixtures**

Create `fixtures/events/external-contributor.json`: copy `happy-create.json` and set `pull_request.user.login` to `"outside-contractor-99"` (this username is what the test will assert is treated as external; the mock layer below short-circuits the API call).

Create `fixtures/events/warn-only.json`: copy `happy-create.json` (no other changes — warn-only state comes from the per-repo config the test injects, not the event payload).

- [ ] **Step 2: Add membership-check and warn-only mocking to the act runner**

The `actions/github-script` step uses the GitHub API via `github.rest`. Under `act`, those calls hit `https://api.github.com` by default unless we override. The cleanest test seam is to mock at the JS layer: extend the orchestrator to allow injecting "what would the GitHub API have returned" via env vars for test runs.

Add a small mock-injection block at the top of `lib/main.js`, replacing the current top-of-file:

```javascript
const { loadConfig } = require('./config');
const { containsJiraKey } = require('./jira-key');
const { ensureComment } = require('./comments');

// Test seam: when MOCK_GH_MEMBERSHIP is set, override the org membership check.
async function checkOrgMembership({ github, org, username }) {
  if (process.env.MOCK_GH_MEMBERSHIP === 'member') return true;
  if (process.env.MOCK_GH_MEMBERSHIP === 'non-member') return false;
  try {
    await github.rest.orgs.checkMembershipForUser({ org, username });
    return true;
  } catch (err) {
    if (err.status === 404 || err.status === 302) return false;
    throw err;
  }
}

// Test seam: when MOCK_GH_CONFIG_BODY is set, override config-loading with literal YAML.
async function maybeMockConfig({ github, context }) {
  if (process.env.MOCK_GH_CONFIG_BODY) {
    const yaml = require('js-yaml');
    const Ajv = require('ajv').default;
    const fs = require('fs');
    const path = require('path');
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'jira-title.schema.json'), 'utf8'));
    const ajv = new Ajv({ allErrors: true, useDefaults: true });
    const validate = ajv.compile(schema);
    const parsed = yaml.load(process.env.MOCK_GH_CONFIG_BODY);
    const ok = validate(parsed);
    if (!ok) return { ok: false, errors: validate.errors.map(e => e.message) };
    return { found: true, ok: true, config: parsed };
  }
  return loadConfig({ github, context });
}

function decision(core, code, reason) {
  core.info(`DECISION=${code}: ${reason}`);
  core.setOutput('decision', code);
}
```

Then within the main function, replace `const cfg = await loadConfig({ github, context });` with:
```javascript
  const cfg = await maybeMockConfig({ github, context });
```

- [ ] **Step 3: Write the idempotent-comment helper**

Create `lib/comments.js`:
```javascript
// Sentinel HTML comment that lets us recognize our own previous comments.
const SENTINEL = '<!-- pr-title-jira-action -->';

/**
 * Post a comment exactly once per (PR × kind). Subsequent runs with the same
 * `kind` short-circuit if a prior matching comment already exists.
 *
 * kind: short string included in the sentinel (e.g. "warn-only", "external").
 */
async function ensureComment({ github, context, kind, body }) {
  const { owner } = context.payload.repository.owner.login
    ? { owner: context.payload.repository.owner.login }
    : { owner: context.payload.repository.full_name.split('/')[0] };
  const repo = context.payload.repository.full_name.split('/')[1];
  const issue_number = context.payload.pull_request.number;

  const marker = `${SENTINEL}<!-- kind=${kind} -->`;
  const existing = await github.paginate(
    github.rest.issues.listComments,
    { owner, repo, issue_number, per_page: 100 }
  );
  if (existing.some(c => c.body && c.body.includes(marker))) {
    return { posted: false, reason: 'already-exists' };
  }

  await github.rest.issues.createComment({
    owner, repo, issue_number,
    body: `${marker}\n${body}`
  });
  return { posted: true };
}

module.exports = { ensureComment, SENTINEL };
```

- [ ] **Step 4: Implement steps 4 and 5 in main.js**

Find the marker `// Subsequent steps (4-10) added by later tasks.` and replace its block with:

```javascript
  // Step 4: External-contributor guard
  const isMember = await checkOrgMembership({
    github,
    org: context.payload.repository.owner.login,
    username: pr.user.login
  });
  if (!isMember) {
    await ensureComment({
      github, context,
      kind: 'external',
      body: `Skipping ticket creation for external contributor \`@${pr.user.login}\`.`
    });
    decision(core, 'skip-external', `${pr.user.login} not a member of ${context.payload.repository.owner.login}`);
    return;
  }

  // Step 5: Warn-only short-circuit
  if (cfg.config.mode === 'warn-only') {
    const project = cfg.config.jira.project;
    await ensureComment({
      github, context,
      kind: 'warn-only',
      body: `I would have created a \`${project}\` ticket here. Set \`mode: active\` in \`.github/jira-title.yml\` to enable.`
    });
    decision(core, 'skip-warn-only', `repo is in warn-only mode (project ${project})`);
    return;
  }

  // Subsequent steps (6-10) added by later tasks.
  decision(core, 'proceed-create', 'all guards passed; would create ticket (later tasks)');
```

- [ ] **Step 5: Update act test runner to inject config + membership mocks**

Augment the case format with optional `config` and `membership` slots and extend the inner act invocation. Replace the CASES array and runner body in `scripts/run-act-tests.sh` with:

```bash
# Each entry: fixture:scenario:expected_decision:config_key:membership
# - config_key: '' uses base-ref-loaded config; otherwise key into CONFIGS map below.
# - membership: 'member' (default) | 'non-member' | 'real' (no mock).
CASES=(
  "happy-create.json:happy:proceed-create:default-active::"
  "draft-opened.json:happy:skip-draft:default-active::"
  "ignore-author.json:happy:skip-ignored-author:default-active::"
  "idempotent-skip-prefix.json:happy:skip-has-key:default-active::"
  "idempotent-skip-no-colon.json:happy:skip-has-key:default-active::"
  "idempotent-skip-mid-title.json:happy:skip-has-key:default-active::"
  "idempotent-skip-trailing.json:happy:skip-has-key:default-active::"
  "external-contributor.json:happy:skip-external:default-active:non-member"
  "warn-only.json:happy:skip-warn-only:warn-only-mode:"
)

declare -A CONFIGS
CONFIGS[default-active]="jira:
  project: BOT
mode: active"
CONFIGS[warn-only-mode]="jira:
  project: BOT
mode: warn-only"

failed=0
for entry in "${CASES[@]}"; do
  IFS=':' read -r fixture scenario expected config_key membership <<<"$entry"
  echo "=== ${fixture} (scenario=${scenario}, expect=${expected}) ==="

  CONFIG_BODY="${CONFIGS[${config_key:-default-active}]:-${CONFIGS[default-active]}}"
  MEMBERSHIP="${membership:-member}"

  LOG=$(mktemp)
  act pull_request_target \
       -e "fixtures/events/${fixture}" \
       -W "${WORKFLOW}" \
       -s JIRA_API_TOKEN=fake-token \
       --env "JIRA_BASE_URL=http://host.docker.internal:${PORT}" \
       --env "MOCK_SCENARIO=${scenario}" \
       --env "MOCK_GH_CONFIG_BODY=${CONFIG_BODY}" \
       --env "MOCK_GH_MEMBERSHIP=${MEMBERSHIP}" \
       --quiet 2>&1 | tee "$LOG"

  if grep -q "DECISION=${expected}" "$LOG"; then
    echo "OK:   ${fixture}"
  else
    echo "FAIL: ${fixture} expected DECISION=${expected}, got:"
    grep "DECISION=" "$LOG" || echo "  (no decision marker found)"
    failed=$((failed + 1))
  fi
  rm "$LOG"
done

if [ "${failed}" -gt 0 ]; then
  echo "${failed} act test(s) failed"
  exit 1
fi
echo "All act tests passed"
```

- [ ] **Step 6: Run tests, verify they pass**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected: all 9 cases OK.

- [ ] **Step 7: Commit**

```bash
git add lib/main.js lib/comments.js fixtures/events scripts/run-act-tests.sh
git commit -m "feat(workflow): step 4 (external guard) + step 5 (warn-only short-circuit)"
```

---

## Task 8: Step 6 — Jira ticket creation with retry

**Files:**
- Create: `lib/jira.js`
- Modify: `lib/main.js`
- Create: `fixtures/events/jira-4xx.json`
- Create: `fixtures/events/jira-5xx-then-success.json`
- Modify: `scripts/run-act-tests.sh`

- [ ] **Step 1: Write the new fixtures**

Create `fixtures/events/jira-4xx.json`: copy `happy-create.json` (event itself is normal; the act test injects the 4xx scenario).

Create `fixtures/events/jira-5xx-then-success.json`: copy `happy-create.json` (same).

- [ ] **Step 2: Append cases to the runner**

Add to `CASES` in `scripts/run-act-tests.sh`:
```bash
  "jira-4xx.json:4xx-auth:fail-jira-4xx:default-active:"
  "jira-5xx-then-success.json:5xx-then-success:created-ticket:default-active:"
```

(Also rename the previous `happy-create.json` expected decision from `proceed-create` to `created-ticket` since this task implements creation.)

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act || true
kill $MOCK_PID
```
Expected: 3 cases FAIL (happy-create now expects `created-ticket`, plus two new ones).

- [ ] **Step 4: Write the Jira client**

Create `lib/jira.js`:
```javascript
const BASE_URL = process.env.JIRA_BASE_URL || 'https://somewearlabs.atlassian.net';
const SCENARIO = process.env.MOCK_SCENARIO || '';

// Atlassian Cloud authenticates via Basic auth with email:api-token base64-encoded.
function authHeader() {
  const email = process.env.JIRA_USER_EMAIL || 'pulse-bot@somewearlabs.com';
  const token = process.env.JIRA_API_TOKEN;
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Create a Jira issue with retry-on-5xx.
 * Returns { ok: true, key, url } on success;
 *         { ok: false, kind: '4xx'|'5xx', status, message } on failure.
 */
async function createIssue({ project, issueType, summary, description, labels }) {
  const TRUNCATED_SUMMARY = truncate(summary, 255);
  const body = {
    fields: {
      project: { key: project },
      issuetype: { name: issueType },
      summary: TRUNCATED_SUMMARY,
      description: description, // ADF in production; spec defers richer description format
      labels: labels
    }
  };

  const delays = [1000, 2000, 4000];
  let lastErr = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(`${BASE_URL}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(SCENARIO ? { 'X-Mock-Scenario': SCENARIO } : {})
      },
      body: JSON.stringify(body)
    });
    if (res.status === 201) {
      const json = await res.json();
      return {
        ok: true,
        key: json.key,
        url: `${BASE_URL}/browse/${json.key}`
      };
    }
    const text = await res.text();
    let message = text;
    try { const j = JSON.parse(text); message = (j.errorMessages || []).join('; ') || text; } catch {}

    if (res.status >= 400 && res.status < 500) {
      return { ok: false, kind: '4xx', status: res.status, message };
    }
    // 5xx or 429 → retry
    lastErr = { kind: '5xx', status: res.status, message };
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return { ok: false, ...lastErr };
}

function truncate(s, maxLen) {
  if (!s) return s;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).replace(/\s+$/, '') + '…';
}

module.exports = { createIssue, truncate };
```

- [ ] **Step 5: Wire creation into main.js**

Find the marker `// Subsequent steps (6-10) added by later tasks.` and replace its block with:

```javascript
  // Step 6: Create Jira ticket (with retry on 5xx).
  const { createIssue } = require('./jira');
  const rendered = renderDescription(cfg.config.description_template, {
    pr_url: pr.html_url,
    pr_title: pr.title,
    pr_body: pr.body || '',
    pr_number: String(pr.number),
    github_login: pr.user.login,
    repo_full_name: context.payload.repository.full_name
  });
  const allLabels = ['auto-created-from-pr', ...(cfg.config.labels || [])];
  const issue = await createIssue({
    project: cfg.config.jira.project,
    issueType: cfg.config.jira.issue_type || 'Task',
    summary: pr.title,
    description: rendered,
    labels: allLabels
  });
  if (!issue.ok) {
    if (issue.kind === '4xx') {
      await ensureComment({
        github, context, kind: 'jira-4xx',
        body: `Failed to create Jira ticket: ${issue.status} ${issue.message}. Please fix \`.github/jira-title.yml\` (project key, issue type, or auth) and re-run.`
      });
      decision(core, 'fail-jira-4xx', `${issue.status} ${issue.message}`);
      core.setFailed(`Jira returned ${issue.status}: ${issue.message}`);
      return;
    }
    // 5xx final
    await ensureComment({
      github, context, kind: 'jira-5xx',
      body: `Temporary Jira issue (${issue.status}). Please add a Jira key to this PR title manually; the Action will not retry.`
    });
    decision(core, 'fail-jira-5xx', `${issue.status} after retries: ${issue.message}`);
    return;
  }

  // Subsequent steps (7-10) added by later tasks.
  decision(core, 'created-ticket', `created ${issue.key}`);
```

Also add this helper at the bottom of `lib/main.js`:

```javascript
function renderDescription(template, vars) {
  const t = template || 'Auto-created from PR: {{pr_url}}\nAuthor: @{{github_login}}\nRepo: {{repo_full_name}}\n\n---\n\n{{pr_body}}';
  return t.replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars[k] != null ? String(vars[k]) : ''));
}
```

- [ ] **Step 6: Run tests, verify they pass**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected: all 11 cases OK.

- [ ] **Step 7: Commit**

```bash
git add lib/jira.js lib/main.js fixtures/events scripts/run-act-tests.sh
git commit -m "feat(workflow): step 6 (Jira create + retry-on-5xx)"
```

---

## Task 9: Step 7 — Compare-and-swap re-check

**Files:**
- Modify: `lib/main.js`
- Create: `fixtures/events/race-loss.json`
- Modify: `scripts/run-act-tests.sh`

- [ ] **Step 1: Write the race-loss fixture**

Create `fixtures/events/race-loss.json`: copy `happy-create.json` unchanged. The race is simulated via a new env var (`MOCK_TITLE_RACE_INJECT`) that makes the post-create title re-fetch return a title containing a key.

- [ ] **Step 2: Add the case to the runner**

Append to `CASES`:
```bash
  "race-loss.json:happy:skip-race-lost:default-active:"
```

And extend the `act` invocation to forward an additional env var. Inside the loop, add:
```bash
       --env "MOCK_TITLE_RACE_INJECT=${race_inject:-}"
```
And update the parsing line and CASES format to add a 6th colon-separated field for `race_inject`. For most cases it stays empty; for `race-loss.json` it's `SBE-9999 race-added title`.

Updated CASES:
```bash
# fixture:scenario:expected_decision:config_key:membership:race_inject
CASES=(
  "happy-create.json:happy:created-ticket:default-active::"
  "draft-opened.json:happy:skip-draft:default-active::"
  "ignore-author.json:happy:skip-ignored-author:default-active::"
  "idempotent-skip-prefix.json:happy:skip-has-key:default-active::"
  "idempotent-skip-no-colon.json:happy:skip-has-key:default-active::"
  "idempotent-skip-mid-title.json:happy:skip-has-key:default-active::"
  "idempotent-skip-trailing.json:happy:skip-has-key:default-active::"
  "external-contributor.json:happy:skip-external:default-active:non-member:"
  "warn-only.json:happy:skip-warn-only:warn-only-mode::"
  "jira-4xx.json:4xx-auth:fail-jira-4xx:default-active::"
  "jira-5xx-then-success.json:5xx-then-success:created-ticket:default-active::"
  "race-loss.json:happy:skip-race-lost:default-active::SBE-9999 race-added title"
)
```

And the IFS line:
```bash
IFS=':' read -r fixture scenario expected config_key membership race_inject <<<"$entry"
```

- [ ] **Step 3: Run tests, verify the new case fails**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act || true
kill $MOCK_PID
```
Expected: race-loss.json FAILs (`created-ticket` returned instead of `skip-race-lost`).

- [ ] **Step 4: Implement CAS re-check**

Find the marker `// Subsequent steps (7-10) added by later tasks.` and replace its block with:

```javascript
  // Step 7: Compare-and-swap re-check — refetch title; if a human (or sibling
  // workflow run) added a key while we were creating the ticket, leak-log
  // and exit without editing the title.
  const refreshed = await fetchPrTitle({ github, context });
  if (containsJiraKey(refreshed)) {
    core.warning(`Race detected: PR title now "${refreshed}" already has a key. Leaked Jira ticket: ${issue.key} (manual cleanup needed).`);
    decision(core, 'skip-race-lost', `created ${issue.key} but race lost; title=${refreshed}`);
    return;
  }

  // Subsequent steps (8-10) added by later tasks.
  decision(core, 'created-ticket', `created ${issue.key}, ready to PATCH title`);
```

Add at the bottom of `lib/main.js`:

```javascript
async function fetchPrTitle({ github, context }) {
  if (process.env.MOCK_TITLE_RACE_INJECT) return process.env.MOCK_TITLE_RACE_INJECT;
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.full_name.split('/')[1];
  const pull_number = context.payload.pull_request.number;
  const res = await github.rest.pulls.get({ owner, repo, pull_number });
  return res.data.title;
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected: all 12 cases OK.

- [ ] **Step 6: Commit**

```bash
git add lib/main.js fixtures/events/race-loss.json scripts/run-act-tests.sh
git commit -m "feat(workflow): step 7 (compare-and-swap re-check)"
```

---

## Task 10: Steps 8+9+10 — Title truncation + PATCH + success comment

**Files:**
- Modify: `lib/main.js`
- Create: `fixtures/events/long-title.json`
- Modify: `scripts/run-act-tests.sh`

- [ ] **Step 1: Write long-title fixture**

Create `fixtures/events/long-title.json`: copy `happy-create.json` and set `pull_request.title` to a 250-character string. Use this exact string (250 chars):
```
Refactor the very large authentication service to consolidate every retry policy across every consumer module so that no client implementation ever again has to reinvent exponential backoff or jittered retry policies for transient infrastructure failures
```

- [ ] **Step 2: Append the case to the runner**

Add to CASES:
```bash
  "long-title.json:happy:patched-title-truncated:default-active::"
```

Also rename the previous `happy-create.json` expected decision from `created-ticket` to `patched-title` since this task implements the title PATCH.

- [ ] **Step 3: Run tests, verify they fail**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act || true
kill $MOCK_PID
```
Expected: 2 cases FAIL (happy-create expected `patched-title`; long-title expected `patched-title-truncated`).

- [ ] **Step 4: Implement steps 8, 9, 10**

Import truncate at top of `lib/main.js` (alongside the other `lib/jira` import):
```javascript
const { truncate } = require('./jira');
```

Find the marker `// Subsequent steps (8-10) added by later tasks.` and replace its block with:

```javascript
  // Step 8: Compute new title; truncate if prefix + original exceeds 256 chars.
  const MAX = 256;
  const prefix = `${issue.key}: `;
  let newTitle;
  let truncated = false;
  if (prefix.length + pr.title.length <= MAX) {
    newTitle = prefix + pr.title;
  } else {
    const maxOriginal = MAX - prefix.length - 1; // reserve 1 char for ellipsis
    const cut = pr.title.slice(0, maxOriginal).replace(/\s+$/, '');
    newTitle = `${prefix}${cut}…`;
    truncated = true;
  }

  // Step 9: PATCH PR title.
  const owner = context.payload.repository.owner.login;
  const repoName = context.payload.repository.full_name.split('/')[1];
  await github.rest.pulls.update({
    owner, repo: repoName,
    pull_number: pr.number,
    title: newTitle
  });

  // Step 10: Post success comment.
  let commentBody = `Created [${issue.key}](${issue.url}) and prepended to title.`;
  if (truncated) {
    commentBody += ` (Original title exceeded GitHub's 256-char limit and was truncated; full text preserved in the ticket description.)`;
  }
  await ensureComment({
    github, context, kind: 'success',
    body: commentBody
  });

  decision(core, truncated ? 'patched-title-truncated' : 'patched-title', `created ${issue.key}, title patched`);
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
npm run mock:jira &
MOCK_PID=$!
sleep 1
npm run test:act
kill $MOCK_PID
```
Expected: all 13 cases OK.

- [ ] **Step 6: Commit**

```bash
git add lib/main.js fixtures/events/long-title.json scripts/run-act-tests.sh
git commit -m "feat(workflow): steps 8-10 (title truncation, PATCH, success comment)"
```

---

## Task 11: Documentation — README, consumer-setup, rollout-guide, architecture, CHANGELOG

**Files:**
- Modify: `README.md`
- Create: `docs/consumer-setup.md`
- Create: `docs/rollout-guide.md`
- Create: `docs/architecture.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Write `docs/consumer-setup.md`**

Create with the full consumer setup instructions including the caller workflow template (with the concurrency block from spec), the schema-magic-comment guidance, and the JIRA_API_TOKEN org-secret requirement:

```markdown
# Consumer setup

To enable the PR-title Jira-key Action in your repo:

## 1. Confirm the org secret is set

`JIRA_API_TOKEN` must be set as an organization secret at `somewear-labs` org level, with your repo on its allowed-repos list. If it isn't, ask the repo owner (currently @theo-gordon) to add it.

## 2. Add the per-repo config

Create `.github/jira-title.yml`:

\`\`\`yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/somewear-labs/github-actions/v1/schema/jira-title.schema.json

jira:
  project: SBE         # required — your target Jira project key
  issue_type: Task     # default; override if you want

mode: warn-only        # start in warn-only; flip to "active" after pod sign-off

ignore_authors:
  - dependabot[bot]
  - renovate[bot]
  - github-actions[bot]

labels:
  - backlog
\`\`\`

## 3. Add the caller workflow

Create `.github/workflows/jira-title.yml`:

\`\`\`yaml
name: Jira Title
on:
  pull_request_target:
    types: [opened, ready_for_review]
permissions:
  pull-requests: write
concurrency:
  group: jira-title-${{ github.event.pull_request.number }}
  cancel-in-progress: false
jobs:
  jira-title:
    uses: somewear-labs/github-actions/.github/workflows/pr-title-jira.yml@v1
    secrets:
      JIRA_API_TOKEN: ${{ secrets.JIRA_API_TOKEN }}
\`\`\`

## 4. Verify

Open a test PR (real or scratch) without a Jira key in the title. The Action should post a "would have created" comment (warn-only mode). When you flip `mode: active`, the next PR will get a real ticket.

## 5. Troubleshooting

See [`rollout-guide.md`](rollout-guide.md).
```

(Note the escaped backticks in the heredoc are because we're embedding YAML inside a markdown code block inside this plan — when you write the actual file, use regular triple backticks.)

- [ ] **Step 2: Write `docs/rollout-guide.md`**

Create with:
- The warn-only → active rollout pattern
- Common failure modes and remediation
- "Things the Action will not touch" (per Travis's review feedback re: idempotency)

Sample structure:
```markdown
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
```

- [ ] **Step 3: Write `docs/architecture.md`**

Create with:
```markdown
# Architecture

The full design lives in [`superpowers/specs/2026-05-19-pr-title-jira-action-design.md`](superpowers/specs/2026-05-19-pr-title-jira-action-design.md). This page is a short orientation.

## What it is

A reusable GitHub Actions workflow that auto-creates Jira tickets for PRs whose titles lack a Jira key. Idempotent. Stateless. Per-repo opt-in via `.github/jira-title.yml`.

## Key decisions

- **Trigger:** `pull_request_target` on `opened` (non-draft) + `ready_for_review` only.
- **Identity:** `pulse-bot@somewearlabs.com` service account; org-level `JIRA_API_TOKEN` secret scoped to consumer repos.
- **Failure mode:** Soft-blocking. 4xx loud (red check); 5xx retried then graceful exit 0. Never a required check by default.
- **Idempotency:** anywhere-in-title key detection (matches Jira's own PR-detection).
- **Implementation:** inline JS via `actions/github-script@v7`, ~300 LOC.

## Test strategy

- `act` runs synthetic event JSON fixtures against a local Jira mock (Express).
- `scripts/test-schema.js` validates the JSON Schema against valid + invalid fixtures.
- Self-CI workflow at `.github/workflows/ci.yml` runs both on push.
- Integration smoke in `somewear-labs/github-actions-fixture` against real (sandbox) Jira.

## Maintenance

- Owner: see `.github/CODEOWNERS`.
- SemVer with moving `v1` tag. Consumers pin `@v1`.
- Changes that affect the title-edit format or the per-repo config schema are breaking and require a major bump.
```

- [ ] **Step 4: Update README.md to link to the new docs**

Replace existing README with:
```markdown
# somewear-labs/github-actions

Reusable GitHub Actions workflows for `somewear-labs` repositories.

## Available workflows

### `pr-title-jira.yml`

Auto-creates a Jira ticket for any PR opened (or marked ready-for-review) without a Jira key in its title, prepends the key to the title, and comments with the ticket link.

- [Consumer setup →](docs/consumer-setup.md)
- [Rollout guide →](docs/rollout-guide.md)
- [Architecture →](docs/architecture.md)
- [Full design spec →](docs/superpowers/specs/2026-05-19-pr-title-jira-action-design.md)

## Development

```bash
npm install               # install dev deps
npm run mock:jira &       # start the Jira mock (port 4111)
npm run test              # schema tests + act-driven workflow tests
```

## Versioning

SemVer. Consumer repos pin `@v1` to get patch updates automatically; pin `@v1.X.Y` for paranoia.

See [CHANGELOG.md](CHANGELOG.md).

## Maintainer

See [CODEOWNERS](.github/CODEOWNERS).
```

- [ ] **Step 5: Update CHANGELOG.md**

Replace contents with:
```markdown
# Changelog

## [Unreleased]

### Added
- `pr-title-jira.yml` reusable workflow.
- JSON Schema for `.github/jira-title.yml` per-repo config.
- Local test harness: act-driven workflow tests + Jira mock server.
- Documentation: consumer-setup, rollout-guide, architecture.

## [Pending v1.0.0]
(See [Unreleased]. Tag will be created after first green CI run.)
```

- [ ] **Step 6: Commit**

```bash
git add README.md CHANGELOG.md docs/
git commit -m "docs: add consumer-setup, rollout-guide, architecture; update README/CHANGELOG"
```

---

## Task 12: Self-CI workflow + tag v1.0.0 / moving v1

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the self-CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  schema:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run test:schema

  act:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install act
        run: |
          curl -sL https://raw.githubusercontent.com/nektos/act/master/install.sh | sudo bash -s -- -b /usr/local/bin
          act --version
      - run: npm ci
      - name: Start Jira mock
        run: |
          npm run mock:jira &
          for i in {1..10}; do
            if curl -sf http://localhost:4111/rest/api/3/myself; then break; fi
            sleep 1
          done
      - run: npm run test:act
```

- [ ] **Step 2: Push the branch and watch CI run**

Push the current state. If you've been committing on `main`, push `main`. If you set up a working branch, push it and open a PR to trigger CI.

Wait for CI to go green. If it fails, fix the cause and push again.

- [ ] **Step 3: Tag v1.0.0 and the moving v1**

Once CI is green on `main`:
```bash
git tag -a v1.0.0 -m "v1.0.0 — initial release"
git tag -a v1 -m "Moving major tag (v1.x)" v1.0.0
git push origin v1.0.0 v1
```

- [ ] **Step 4: Update CHANGELOG to reflect the release**

Edit `CHANGELOG.md`, move the Unreleased items under `## [1.0.0] - <today's date>` and reset Unreleased to empty:
```markdown
# Changelog

## [Unreleased]

## [1.0.0] - 2026-05-26

### Added
- `pr-title-jira.yml` reusable workflow.
- JSON Schema for `.github/jira-title.yml` per-repo config.
- Local test harness: act-driven workflow tests + Jira mock server.
- Documentation: consumer-setup, rollout-guide, architecture.
```

Commit:
```bash
git add CHANGELOG.md
git commit -m "docs(changelog): release v1.0.0"
git push
```

---

## Task 13: Provision pulse-bot Jira service account + org secret

**Operational task. No code; checklist items.**

- [ ] **Step 1: Create the Jira user**

In Atlassian Admin (admin.atlassian.com → `somewearlabs.atlassian.net`):

1. Invite a new user `pulse-bot@somewearlabs.com`.
2. Display name: `pulse-bot`.
3. Add to Jira product access; do not add to Confluence or other products.
4. Set up the inbox forwarding so password-reset and security mail goes to your team email (or set up a shared mailbox).
5. Set a strong password (won't be used; Action uses API token).

- [ ] **Step 2: Grant minimum project permissions**

For each consumer Jira project (start with `SBE`, `BAC`):
1. Add `pulse-bot` to the project role that has "Create Issues" and "Add Comments" permissions. (Typically "Developers" or "Members".)
2. Verify `pulse-bot` does NOT have admin or delete permissions.

Also create a sandbox project for testing:
1. Create project key `BOT` (Team-Managed, type: Software). Owner: `pulse-bot`.

- [ ] **Step 3: Generate an API token**

1. Log in to Atlassian as `pulse-bot`.
2. Go to https://id.atlassian.com/manage-profile/security/api-tokens.
3. Create a new token; name it `github-actions-pr-title`. Copy the value.
4. Note: API tokens for Atlassian Cloud expire after 1 year unless rotated.

- [ ] **Step 4: Set the org secret**

On GitHub:
1. Go to https://github.com/organizations/somewear-labs/settings/secrets/actions.
2. Click "New organization secret".
3. Name: `JIRA_API_TOKEN`.
4. Value: the API token from Step 3.
5. Repository access: "Selected repositories" → start with just `somewear-labs/github-actions-fixture` (created in Task 14) and `somewear-labs/github-actions` itself.

- [ ] **Step 5: Smoke-test the credential**

```bash
curl -s -u pulse-bot@somewearlabs.com:<TOKEN> \
  https://somewearlabs.atlassian.net/rest/api/3/myself | jq
```
Expected: JSON response with `accountId`, `displayName: "pulse-bot"`, `emailAddress`.

- [ ] **Step 6: Record what was done in CHANGELOG of the org docs (optional)**

If somewear-labs has an internal infra log, note the new bot account, the rotation date (one year out), and the credential storage location.

---

## Task 14: Scaffold fixture repo for end-to-end smoke

**Files:**
- Create: `somewear-labs/github-actions-fixture` (new GitHub repo)
- Create: `somewear-labs/github-actions-fixture/.github/jira-title.yml`
- Create: `somewear-labs/github-actions-fixture/.github/workflows/jira-title.yml`
- Create: `somewear-labs/github-actions-fixture/README.md`
- Create: `somewear-labs/github-actions-fixture/src/placeholder.txt`

- [ ] **Step 1: Create the fixture repo**

```bash
cd ~
gh repo create somewear-labs/github-actions-fixture \
  --private \
  --description "Integration-test fixture for somewear-labs/github-actions pr-title-jira workflow" \
  --clone
cd github-actions-fixture
```

- [ ] **Step 2: Add the config and workflow**

Create `.github/jira-title.yml`:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/somewear-labs/github-actions/v1/schema/jira-title.schema.json
jira:
  project: BOT
mode: active
```

Create `.github/workflows/jira-title.yml` (copy from `docs/consumer-setup.md` in the github-actions repo).

Create `README.md`:
```markdown
# github-actions-fixture

Smoke-test fixture for `somewear-labs/github-actions`. Open scratch PRs against this repo to validate the Action against real (sandbox) Jira before pilot rollouts.
```

Create `src/placeholder.txt`:
```
This file exists so the repo has something to edit when opening test PRs.
```

- [ ] **Step 3: Verify the org secret is accessible**

The repo needs to be on the `JIRA_API_TOKEN` allowed-repos list (set up in Task 13, Step 4). Verify by going to `https://github.com/organizations/somewear-labs/settings/secrets/actions/JIRA_API_TOKEN`.

- [ ] **Step 4: Push and merge to main**

```bash
git add -A
git commit -m "chore: initial scaffold + wire up github-actions/pr-title-jira"
git push -u origin main
```

- [ ] **Step 5: Open a scratch PR and observe**

```bash
git checkout -b smoke/first-pr
echo "edit $(date)" >> src/placeholder.txt
git add src/placeholder.txt
git commit -m "smoke: first end-to-end Action run"
git push -u origin smoke/first-pr
gh pr create --title "Smoke test for PR-title-Jira Action" --body "First end-to-end run."
```

Wait for the Action to run (visible in the Actions tab of the fixture repo). Within ~30s expect:
1. PR title updated to `BOT-<N>: Smoke test for PR-title-Jira Action`.
2. A new comment on the PR with the ticket link.
3. A new issue in the `BOT` Jira project with the PR linked.

If any of these fails, troubleshoot via the Action logs and the rollout-guide.

- [ ] **Step 6: Close the smoke PR (do not merge)**

```bash
gh pr close <PR_NUMBER> --delete-branch
```

- [ ] **Step 7: Optionally close the Jira ticket(s) created during smoke**

Manually mark them "Done" / "Won't Do" in Jira to keep the BOT project tidy.

---

## Task 15: Pilot wire-up PR in `ataklibs` (warn-only)

**Files (in `somewear-labs/ataklibs`):**
- Create: `.github/jira-title.yml`
- Create: `.github/workflows/jira-title.yml`

- [ ] **Step 1: Coordinate with the pod lead**

Identify the engineering lead for `ataklibs`. (Ask the user if unknown.) Walk them through:
- What the Action will do.
- The proposed `jira.project` for ataklibs (probably `SBE`).
- The proposed `jira.issue_type` (probably `Task`).
- The warn-only mode for the first wait period; pod lead decides the active-flip date.

- [ ] **Step 2: Add ataklibs to JIRA_API_TOKEN allowed-repos**

On GitHub:
1. Go to https://github.com/organizations/somewear-labs/settings/secrets/actions/JIRA_API_TOKEN.
2. Add `somewear-labs/ataklibs` to "Selected repositories".

- [ ] **Step 3: Clone ataklibs and create a feature branch**

```bash
cd ~
gh repo clone somewear-labs/ataklibs
cd ataklibs
git checkout -b feature/enable-pr-title-jira-action
```

- [ ] **Step 4: Add the config (warn-only)**

Create `.github/jira-title.yml`:
```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/somewear-labs/github-actions/v1/schema/jira-title.schema.json

jira:
  project: SBE
  issue_type: Task

mode: warn-only

ignore_authors:
  - dependabot[bot]
  - renovate[bot]
  - github-actions[bot]
```

- [ ] **Step 5: Add the caller workflow**

Create `.github/workflows/jira-title.yml` (copy from `docs/consumer-setup.md`).

- [ ] **Step 6: Commit and open PR**

```bash
git add .github/jira-title.yml .github/workflows/jira-title.yml
git commit -m "ci: enable PR-title Jira-key Action (warn-only)"
git push -u origin feature/enable-pr-title-jira-action
gh pr create \
  --title "ci: enable PR-title Jira-key Action (warn-only)" \
  --body "Wires up the reusable workflow from somewear-labs/github-actions. Starting in warn-only mode — Action will run on every PR and post a 'would have created' comment, but won't actually call Jira or edit titles. After observation, a follow-up PR will flip mode to active. See https://github.com/somewear-labs/github-actions/blob/main/docs/rollout-guide.md."
```

Tag the pod lead as reviewer. Merge after their approval.

- [ ] **Step 7: Verify warn-only behavior**

Wait for a new PR to be opened in ataklibs after the wire-up PR merges. Confirm:
- Action runs on the new PR.
- A warn-only comment is posted ("I would have created a SBE ticket…").
- No Jira ticket is created (verify in Jira via search).
- No PR title is edited.

If the wait-period is going to be long, the user owns the timing; this task ends after the warn-only PR has merged and at least one downstream PR has demonstrated warn-only behavior correctly.

---

## Task 16: Pilot active-mode flip in `ataklibs`

**Files (in `somewear-labs/ataklibs`):**
- Modify: `.github/jira-title.yml`

This task happens *after* the user has decided the warn-only observation is sufficient. The user manages the timing; this task is just the mechanical flip.

- [ ] **Step 1: Get pod-lead sign-off**

Confirm with the ataklibs pod lead that they've seen warn-only output on at least a few PRs and are ready to flip.

- [ ] **Step 2: Open the flip PR**

```bash
cd ~/ataklibs
git checkout main && git pull
git checkout -b feature/flip-pr-title-jira-active
```

Edit `.github/jira-title.yml` and change:
```yaml
mode: warn-only
```
to:
```yaml
mode: active
```

```bash
git add .github/jira-title.yml
git commit -m "ci: flip PR-title Jira-key Action to active"
git push -u origin feature/flip-pr-title-jira-active
gh pr create \
  --title "ci: flip PR-title Jira-key Action to active" \
  --body "Pod lead has signed off on warn-only observation; flipping to active. New PRs without a Jira key will now have a SBE ticket auto-created and the title edited."
```

Pod lead reviews and merges.

- [ ] **Step 3: Verify active behavior on the next downstream PR**

Wait for a PR in ataklibs without a Jira key in its title. Confirm:
- A new ticket appears in the `SBE` project labeled `auto-created-from-pr`.
- The PR title is updated to `SBE-<N>: <original title>`.
- A comment is posted with the ticket link.

If any of these fails, immediately open a follow-up PR to revert to warn-only and triage.

- [ ] **Step 4: Update CHANGELOG in the github-actions repo**

Add a line under the appropriate version:
```markdown
- Pilot rollout: `ataklibs` flipped to active mode (YYYY-MM-DD).
```

```bash
cd ~/github-actions
git add CHANGELOG.md
git commit -m "docs(changelog): record ataklibs active-mode flip"
git push
```

---

## Self-review checklist

Run through this after writing the plan; fix anything inline.

### Spec coverage

| Spec section | Task(s) implementing |
|---|---|
| Architecture diagram | Tasks 1, 4 |
| Components file layout | Tasks 1-3, 11 |
| `pull_request_target` event types + permissions | Task 4 |
| Per-repo config schema | Task 3 |
| `mode: warn-only` rollout mechanism | Tasks 7, 15 |
| Default `ignore_authors` | Tasks 3, 6 |
| Data flow step 0 (draft filter) | Task 5 |
| Data flow step 1 (config load + validate) | Task 5 |
| Data flow step 2 (author ignore) | Task 6 |
| Data flow step 3 (anywhere-key idempotency) | Task 6 |
| Data flow step 4 (external-contributor guard) | Task 7 |
| Data flow step 5 (warn-only short-circuit) | Task 7 |
| Data flow step 6 (Jira create + retry on 5xx) | Task 8 |
| Data flow step 7 (compare-and-swap re-check) | Task 9 |
| Data flow step 8 (title truncation, 256-char) | Task 10 |
| Data flow step 9 (PATCH PR title) | Task 10 |
| Data flow step 10 (success comment with truncation note) | Task 10 |
| 4xx-tier failure (red check + comment) | Task 8 |
| 5xx-tier failure (retry then comment + exit 0) | Task 8 |
| Org-level secret + scoping | Task 13 |
| `pulse-bot` service account creation | Task 13 |
| Sandbox `BOT` project | Task 13 |
| Concurrency block in caller template | Task 11 (docs/consumer-setup.md) |
| Versioning + `v1` moving tag | Task 12 |
| CODEOWNERS | Task 1 |
| Fixture-repo end-to-end smoke | Task 14 |
| Pilot wire-up in ataklibs (warn-only) | Task 15 |
| Pilot active-mode flip | Task 16 |
| Open items (assignee mapping, etc.) | Out of scope — spec leaves these for future |

No gaps.

### Placeholder scan

- No "TBD", "TODO", "implement later" left in.
- Every code step shows the actual code.
- Every command shows expected output.
- Every test step shows the actual assertion.
- CODEOWNERS login `@theo-gordon` was verified with the user before plan finalization.

### Type consistency

- `lib/config.js` exports `loadConfig({ github, context })` returning `{ found, ok, config, errors }`. Used consistently in Tasks 5, 7.
- `lib/jira-key.js` exports `containsJiraKey(title)` and `JIRA_KEY_RE`. Used in Tasks 6, 9.
- `lib/jira.js` exports `createIssue({...})` returning `{ ok, key, url } | { ok: false, kind, status, message }` and `truncate(s, maxLen)`. Used in Tasks 8, 10.
- `lib/comments.js` exports `ensureComment({ github, context, kind, body })` returning `{ posted, reason? }`. Used in Tasks 7, 8, 10. Comment sentinel format is consistent: `<!-- pr-title-jira-action --><!-- kind=KIND -->`.
- `decision(core, code, reason)` helper used consistently in Tasks 5-10.
- Step numbering in `main.js` matches data-flow numbering in the spec throughout.

No inconsistencies.
