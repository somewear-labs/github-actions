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

# Each entry: fixture:scenario:expected_decision:config_key:membership
# - config_key: '' uses base-ref-loaded config; otherwise key into CONFIGS map below.
# - membership: 'member' (default) | 'non-member' | 'real' (no mock).
CASES=(
  "happy-create.json:happy:created-ticket:default-active::"
  "draft-opened.json:happy:skip-draft:default-active::"
  "ignore-author.json:happy:skip-ignored-author:default-active::"
  "idempotent-skip-prefix.json:happy:skip-has-key:default-active::"
  "idempotent-skip-no-colon.json:happy:skip-has-key:default-active::"
  "idempotent-skip-mid-title.json:happy:skip-has-key:default-active::"
  "idempotent-skip-trailing.json:happy:skip-has-key:default-active::"
  "external-contributor.json:happy:skip-external:default-active:non-member"
  "warn-only.json:happy:skip-warn-only:warn-only-mode:"
  "jira-4xx.json:4xx-auth:fail-jira-4xx:default-active::"
  "jira-5xx-then-success.json:5xx-then-success:created-ticket:default-active::"
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
  # Allow act to exit non-zero (e.g. core.setFailed cases); the DECISION grep below is the real assertion.
  act pull_request_target \
       -e "fixtures/events/${fixture}" \
       -W "${WORKFLOW}" \
       -s JIRA_API_TOKEN=fake-token \
       --env "JIRA_BASE_URL=http://host.docker.internal:${PORT}" \
       --env "MOCK_SCENARIO=${scenario}" \
       --env "MOCK_GH_CONFIG_BODY=${CONFIG_BODY}" \
       --env "MOCK_GH_MEMBERSHIP=${MEMBERSHIP}" \
       --quiet 2>&1 | tee "$LOG" || true

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
