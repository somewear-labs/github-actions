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

# Each entry: fixture:scenario:expected_decision
CASES=(
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
