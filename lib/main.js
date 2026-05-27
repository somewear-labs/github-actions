const { loadConfig, validateConfigBody } = require('./config');
const { containsJiraKey } = require('./jira-key');
const { ensureComment } = require('./comments');
const { createIssue, truncate } = require('./jira');
const { repoCoords } = require('./repo-coords');

// GitHub's PR title length limit (UTF-16 code units per gh-api).
const GITHUB_PR_TITLE_MAX = 256;

// Test seam: when MOCK_GH_MEMBERSHIP is set, override the org membership check.
async function checkOrgMembership({ github, org, username }) {
  if (process.env.MOCK_GH_MEMBERSHIP === 'member') return true;
  if (process.env.MOCK_GH_MEMBERSHIP === 'non-member') return false;
  try {
    await github.rest.orgs.checkMembershipForUser({ org, username });
    return true;
  } catch (err) {
    if (err.status === 404 || err.status === 302) return false;
    throw err;
  }
}

// Test seam: when MOCK_GH_CONFIG_BODY is set, override config-loading with literal YAML.
// Delegates to validateConfigBody (same path loadConfig uses) so the validation +
// error-shape contract stays in lock-step with production.
async function maybeMockConfig({ github, context }) {
  if (process.env.MOCK_GH_CONFIG_BODY) {
    return validateConfigBody(process.env.MOCK_GH_CONFIG_BODY);
  }
  return loadConfig({ github, context });
}

function decision(core, code, reason) {
  core.info(`DECISION=${code}: ${reason}`);
  core.setOutput('decision', code);
}

module.exports = async function main({ github, context, core }) {
  const pr = context.payload.pull_request;
  if (!pr) {
    decision(core, 'skip-no-pr', 'no pull_request in payload');
    return;
  }
  core.info(`pr-title-jira: PR #${pr.number} "${pr.title}" action=${context.payload.action} draft=${pr.draft}`);

  // Step 0: Draft filter
  if (context.payload.action === 'opened' && pr.draft === true) {
    decision(core, 'skip-draft', 'opened event on a draft PR');
    return;
  }

  // Step 1: Load config
  const cfg = await maybeMockConfig({ github, context });
  if (cfg.found === false) {
    decision(core, 'skip-no-config', 'no .github/jira-title.yml on base ref');
    return;
  }
  if (cfg.ok === false) {
    // YAML parse error and schema violation are distinct operator-facing
    // failure modes. A typo in indentation should surface as "config syntax"
    // rather than "schema violation" which would send the operator chasing
    // the wrong fix.
    const isYamlError = cfg.kind === 'yaml';
    const code = isYamlError ? 'fail-config-syntax' : 'fail-schema-invalid';
    const label = isYamlError ? 'Config syntax error' : 'Config schema violation';
    decision(core, code, `${label}: ${cfg.errors.join('; ')}`);
    core.setFailed(`${label}: ${cfg.errors.join('; ')}`);
    return;
  }

  // Step 2: Author ignore list
  const ignored = cfg.config.ignore_authors || [];
  const author = pr.user.login;
  if (ignored.includes(author)) {
    decision(core, 'skip-ignored-author', `author ${author} is in ignore_authors`);
    return;
  }

  // Step 3: Idempotency check — key anywhere in title
  if (containsJiraKey(pr.title)) {
    decision(core, 'skip-has-key', `title already contains a Jira key: "${pr.title}"`);
    return;
  }

  // Step 4: External-contributor guard
  const { owner: orgLogin } = repoCoords(context);
  const isMember = await checkOrgMembership({
    github,
    org: orgLogin,
    username: pr.user.login
  });
  if (!isMember) {
    await ensureComment({
      github, context,
      kind: 'external',
      body: `Skipping ticket creation for external contributor \`@${pr.user.login}\`.`
    });
    decision(core, 'skip-external', `${pr.user.login} not a member of ${orgLogin}`);
    return;
  }

  // Step 5: Warn-only short-circuit
  if (cfg.config.mode === 'warn-only') {
    const project = cfg.config.jira.project;
    await ensureComment({
      github, context,
      kind: 'warn-only',
      body: `I would have created a \`${project}\` ticket here. Set \`mode: active\` in \`.github/jira-title.yml\` to enable.`
    });
    decision(core, 'skip-warn-only', `repo is in warn-only mode (project ${project})`);
    return;
  }

  // Step 6: Create Jira ticket (with retry on 5xx).
  const rendered = renderDescription(cfg.config.description_template, {
    pr_url: pr.html_url,
    pr_title: pr.title,
    pr_body: pr.body || '',
    pr_number: String(pr.number),
    github_login: pr.user.login,
    repo_full_name: context.payload.repository.full_name
  });
  const allLabels = ['auto-created-from-pr', ...(cfg.config.labels || [])];
  const issue = await createIssue({
    project: cfg.config.jira.project,
    issueType: cfg.config.jira.issue_type || 'Task',
    summary: pr.title,
    description: rendered,
    labels: allLabels
  });
  if (!issue.ok) {
    if (issue.kind === '4xx') {
      // Special case: token wasn't set at all (status 0). Distinguish from
      // a real Jira 4xx so the operator sees a clearer message and doesn't
      // chase the config or project-key path.
      if (issue.status === 0) {
        await ensureComment({
          github, context, kind: 'jira-missing-token',
          body: `Failed to create Jira ticket: ${issue.message}`
        });
        decision(core, 'fail-missing-token', issue.message);
        core.setFailed(issue.message);
        return;
      }
      await ensureComment({
        github, context, kind: 'jira-4xx',
        body: `Failed to create Jira ticket: ${issue.status} ${issue.message}. Please fix \`.github/jira-title.yml\` (project key, issue type, or auth) and re-run.`
      });
      decision(core, 'fail-jira-4xx', `${issue.status} ${issue.message}`);
      core.setFailed(`Jira returned ${issue.status}: ${issue.message}`);
      return;
    }
    // 5xx final
    await ensureComment({
      github, context, kind: 'jira-5xx',
      body: `Temporary Jira issue (${issue.status}). Please add a Jira key to this PR title manually; the Action will not retry.`
    });
    decision(core, 'fail-jira-5xx', `${issue.status} after retries: ${issue.message}`);
    return;
  }

  // Step 7: Compare-and-swap re-check — refetch title; if a human (or sibling
  // workflow run) added a key while we were creating the ticket, leak-log
  // and exit without editing the title.
  //
  // If the refetch itself fails (transient 5xx, rate-limit, network blip),
  // we warn and continue to PATCH anyway: the worst case is we PATCH over
  // a title that already had a key, but that's strictly better than crashing
  // with a stack trace after a Jira ticket was created.
  let refreshed;
  try {
    refreshed = await fetchPrTitle({ github, context });
  } catch (err) {
    core.warning(`Could not refetch PR title for race check (continuing to PATCH): ${err.message}`);
    refreshed = pr.title;
  }
  if (containsJiraKey(refreshed)) {
    core.warning(`Race detected: PR title now "${refreshed}" already has a key. Leaked Jira ticket: ${issue.key} (manual cleanup needed).`);
    decision(core, 'skip-race-lost', `created ${issue.key} but race lost; title=${refreshed}`);
    return;
  }

  // Step 8: Compute new title; truncate if prefix + original exceeds the
  // GitHub PR-title limit. Uses the same truncate() helper as lib/jira.js
  // for summary truncation so both surfaces have consistent behavior
  // (slice to N-1, trim trailing whitespace, append ellipsis).
  const prefix = `${issue.key}: `;
  const willFit = prefix.length + pr.title.length <= GITHUB_PR_TITLE_MAX;
  const truncated = !willFit;
  const newTitle = willFit
    ? prefix + pr.title
    : prefix + truncate(pr.title, GITHUB_PR_TITLE_MAX - prefix.length);

  // Step 9: PATCH PR title.
  //
  // If the PATCH fails (422 branch-protection rejects title edits, 404 PR
  // closed mid-run, 429 rate-limit, 5xx transient), the Jira ticket still
  // exists — we record patch-failed and post a success-style comment with
  // the ticket link so the human can manually add the prefix. Without this
  // guard, the action crashed with a stack trace and never posted the
  // comment, leaking the ticket invisibly.
  const { owner, repo: repoName } = repoCoords(context);
  let patchedOk = true;
  let patchErr = null;
  if (!process.env.MOCK_NO_GH_API) {
    try {
      await github.rest.pulls.update({
        owner, repo: repoName,
        pull_number: pr.number,
        title: newTitle
      });
    } catch (err) {
      patchedOk = false;
      patchErr = err;
      core.warning(`Failed to PATCH PR title (continuing to comment): ${err.status || ''} ${err.message}`);
    }
  }

  // Step 10: Post success comment (or recovery comment if PATCH failed).
  let commentBody;
  if (patchedOk) {
    commentBody = `Created [${issue.key}](${issue.url}) and prepended to title.`;
    if (truncated) {
      commentBody += ` (Original title exceeded GitHub's 256-char limit and was truncated; full text preserved in the ticket description.)`;
    }
  } else {
    commentBody = `Created [${issue.key}](${issue.url}) but could not update the PR title (${patchErr.status || 'error'}: ${patchErr.message}). Please prefix the title with \`${issue.key}: \` manually.`;
  }
  await ensureComment({
    github, context, kind: patchedOk ? 'success' : 'patch-failed',
    body: commentBody
  });

  if (!patchedOk) {
    decision(core, 'patch-failed', `created ${issue.key} but PATCH failed: ${patchErr.message}`);
    return;
  }
  decision(core, truncated ? 'patched-title-truncated' : 'patched-title', `created ${issue.key}, title patched`);
};

function renderDescription(template, vars) {
  const t = template || 'Auto-created from PR: {{pr_url}}\nAuthor: @{{github_login}}\nRepo: {{repo_full_name}}\n\n---\n\n{{pr_body}}';
  return t.replace(/\{\{(\w+)\}\}/g, (_m, k) => (vars[k] != null ? String(vars[k]) : ''));
}

async function fetchPrTitle({ github, context }) {
  if (process.env.MOCK_TITLE_RACE_INJECT) return process.env.MOCK_TITLE_RACE_INJECT;
  // Test seam: when MOCK_NO_GH_API is set, return the original PR title (no race).
  if (process.env.MOCK_NO_GH_API) return context.payload.pull_request.title;
  const { owner, repo } = repoCoords(context);
  const pull_number = context.payload.pull_request.number;
  const res = await github.rest.pulls.get({ owner, repo, pull_number });
  return res.data.title;
}
