# Consumer setup

To enable the PR-title Jira-key Action in your repo:

## 1. Confirm the org secret + variable are set

The action authenticates to Atlassian Cloud with HTTP Basic auth using an `email:api-token` pair.

- **`JIRA_API_TOKEN`** — organization **secret** holding an Atlassian API token. Must be set at `somewear-labs` org level with your repo on its allowed-repos list.
- **`JIRA_USER_EMAIL`** — organization **variable** holding the Atlassian email the token was issued for. Defaults to `pulse-bot@somewearlabs.com` if unset; override if the token belongs to a different account.

If either isn't set, ask the repo owner (see [`.github/CODEOWNERS`](../.github/CODEOWNERS)) to add it.

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

# Optional: customize the Jira ticket description. Available placeholders:
#   {{pr_url}} {{pr_title}} {{pr_body}} {{pr_number}}
#   {{github_login}} {{repo_full_name}}
# description_template: |
#   {{pr_title}}
#
#   PR: {{pr_url}}
#   Author: @{{github_login}}
#
#   ---
#
#   {{pr_body}}
```

See [`schema/jira-title.schema.json`](../schema/jira-title.schema.json) for the full field list.

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

## 5. Title truncation

GitHub PR titles are capped at **256 characters**. If your title is already long, the action prepends `<KEY>: ` and then trims the trailing portion of the original with a `…` ellipsis so the final title fits within the limit. The full untruncated title is preserved in the Jira ticket description for reference, and the success comment notes when truncation happened.

## 6. Advanced — Jira instance override

By default the action targets `https://somewearlabs.atlassian.net`. To point at a different instance (e.g. a sandbox or staging Atlassian Cloud), set a repo or org **variable** `JIRA_BASE_URL` to the new base URL. Useful for:

- Pre-pilot testing against an isolated Atlassian instance.
- Pinning a single repo to a different tenant without re-deploying the action.

## 7. Troubleshooting

See [`rollout-guide.md`](rollout-guide.md).
