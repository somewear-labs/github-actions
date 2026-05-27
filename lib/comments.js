const { repoCoords } = require('./repo-coords');

// Sentinel HTML comment that lets us recognize our own previous comments.
const SENTINEL = '<!-- pr-title-jira-action -->';

/**
 * Post a comment exactly once per (PR × kind). Subsequent runs with the same
 * `kind` short-circuit if a prior matching comment already exists.
 *
 * kind: short string included in the sentinel (e.g. "warn-only", "external").
 */
async function ensureComment({ github, context, kind, body }) {
  // Test seam: skip real GitHub API calls when running under act integration tests.
  if (process.env.MOCK_NO_GH_API) {
    return { posted: true, mocked: true };
  }
  const { owner, repo } = repoCoords(context);
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
