const { loadConfig } = require('./config');

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
  const cfg = await loadConfig({ github, context });
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
  const { containsJiraKey } = require('./jira-key');
  if (containsJiraKey(pr.title)) {
    decision(core, 'skip-has-key', `title already contains a Jira key: "${pr.title}"`);
    return;
  }

  // Subsequent steps (4-10) added by later tasks.
  decision(core, 'proceed-create', 'all early checks passed; would create ticket (later tasks)');
};
