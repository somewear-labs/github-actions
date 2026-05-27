# Changelog

## [Unreleased]

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
