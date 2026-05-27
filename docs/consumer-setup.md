# Consumer setup

To enable the PR-title Jira-key Action in your repo:

## 1. Confirm the org secret is set

`JIRA_API_TOKEN` must be set as an organization secret at `somewear-labs` org level, with your repo on its allowed-repos list. If it isn't, ask the repo owner (currently @theo-gordon) to add it.

## 2. Add the per-repo config

Create `.github/jira-title.yml`:

```yaml
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
```

## 3. Add the caller workflow

Create `.github/workflows/jira-title.yml`:

```yaml
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
```

## 4. Verify

Open a test PR (real or scratch) without a Jira key in the title. The Action should post a "would have created" comment (warn-only mode). When you flip `mode: active`, the next PR will get a real ticket.

## 5. Troubleshooting

See [`rollout-guide.md`](rollout-guide.md).
