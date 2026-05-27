// Inline entry point invoked by .github/workflows/pr-title-jira.yml.
// Each numbered step from the spec's "Data flow" section is implemented
// in subsequent tasks (5-10). For now this is a no-op stub that just logs.

module.exports = async function main({ github, context, core }) {
  core.info('pr-title-jira: invoked');
  core.info(`event: ${context.eventName}, action: ${context.payload.action}`);
  core.info(`pr: #${context.payload.pull_request?.number} "${context.payload.pull_request?.title}"`);
  // Steps 0-10 fill in here in later tasks.
};
