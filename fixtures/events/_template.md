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

**Linux note:** On most Linux Docker installations `host.docker.internal` does not resolve out of the box. With Docker 20.10+ you can pass `--container-options "--add-host=host.docker.internal:host-gateway"` to `act`, or substitute your `docker0` bridge IP (often `172.17.0.1`).
