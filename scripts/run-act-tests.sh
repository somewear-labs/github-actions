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
