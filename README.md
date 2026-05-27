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
