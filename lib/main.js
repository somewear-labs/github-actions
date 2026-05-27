const { loadConfig } = require('./config');
const { containsJiraKey } = require('./jira-key');
const { ensureComment } = require('./comments');
const { createIssue, truncate } = require('./jira');

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
async function maybeMockConfig({ github, context }) {
  if (process.env.MOCK_GH_CONFIG_BODY) {
    const yaml = require('js-yaml');
    const Ajv = require('ajv').default;
    const fs = require('fs');
    const path = require('path');
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'schema', 'jira-title.schema.json'), 'utf8'));
    const ajv = new Ajv({ allErrors: true, useDefaults: true });
    const validate = ajv.compile(schema);
    const parsed = yaml.load(process.env.MOCK_GH_CONFIG_BODY);
    const ok = validate(parsed);
    if (!ok) return { ok: false, errors: validate.errors.map(e => e.message) };
    return { found: true, ok: true, config: parsed };
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
    decision(core, 'fail-schema-invalid', `config schema violation: ${cfg.errors.join('; ')}`);
    core.setFailed(`Config schema violation: ${cfg.errors.join('; ')}`);
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
  const isMember = await checkOrgMembership({
    github,
    org: context.payload.repository.owner.login,
    username: pr.user.login
  });
  if (!isMember) {
    await ensureComment({
      github, context,
      kind: 'external',
      body: `Skipping ticket creation for external contributor \`@${pr.user.login}\`.`
    });
    decision(core, 'skip-external', `${pr.user.login} not a member of ${context.payload.repository.owner.login}`);
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
  const refreshed = await fetchPrTitle({ github, context });
  if (containsJiraKey(refreshed)) {
    core.warning(`Race detected: PR title now "${refreshed}" already has a key. Leaked Jira ticket: ${issue.key} (manual cleanup needed).`);
    decision(core, 'skip-race-lost', `created ${issue.key} but race lost; title=${refreshed}`);
    return;
  }

  // Step 8: Compute new title; truncate if prefix + original exceeds 256 chars.
  const MAX = 256;
  const prefix = `${issue.key}: `;
  let newTitle;
  let truncated = false;
  if (prefix.length + pr.title.length <= MAX) {
    newTitle = prefix + pr.title;
  } else {
    const maxOriginal = MAX - prefix.length - 1; // reserve 1 char for ellipsis
    const cut = pr.title.slice(0, maxOriginal).replace(/\s+$/, '');
    newTitle = `${prefix}${cut}…`;
    truncated = true;
  }

  // Step 9: PATCH PR title.
  const owner = context.payload.repository.owner.login;
  const repoName = context.payload.repository.full_name.split('/')[1];
  if (!process.env.MOCK_NO_GH_API) {
    await github.rest.pulls.update({
      owner, repo: repoName,
      pull_number: pr.number,
      title: newTitle
    });
  }

  // Step 10: Post success comment.
  let commentBody = `Created [${issue.key}](${issue.url}) and prepended to title.`;
  if (truncated) {
    commentBody += ` (Original title exceeded GitHub's 256-char limit and was truncated; full text preserved in the ticket description.)`;
  }
  await ensureComment({
    github, context, kind: 'success',
    body: commentBody
  });

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
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.full_name.split('/')[1];
  const pull_number = context.payload.pull_request.number;
  const res = await github.rest.pulls.get({ owner, repo, pull_number });
  return res.data.title;
}
