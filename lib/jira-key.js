// Matches Jira's native PR-detection: any [A-Z][A-Z0-9]{1,9}-\d{1,6} token
// at a word boundary, anywhere in the title.
const JIRA_KEY_RE = /\b[A-Z][A-Z0-9]{1,9}-\d{1,6}\b/;

function containsJiraKey(title) {
  return JIRA_KEY_RE.test(title);
}

module.exports = { containsJiraKey, JIRA_KEY_RE };
