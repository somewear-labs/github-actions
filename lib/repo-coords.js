/**
 * Extract { owner, repo } from a webhook payload context.
 *
 * Tolerates the two shapes the payload can take in practice:
 *   - repository.owner.login + repository.name (normal pull_request_target)
 *   - repository.full_name (fallback when sub-fields are missing)
 *
 * Centralizes the resolution so call sites don't reinvent it inconsistently.
 */
function repoCoords(context) {
  const repository = context.payload.repository;
  const owner = repository.owner?.login ?? repository.full_name.split('/')[0];
  const repo = repository.name ?? repository.full_name.split('/')[1];
  return { owner, repo };
}

module.exports = { repoCoords };
