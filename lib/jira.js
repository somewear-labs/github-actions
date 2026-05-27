const BASE_URL = process.env.JIRA_BASE_URL || 'https://somewearlabs.atlassian.net';
const SCENARIO = process.env.MOCK_SCENARIO || '';

// Atlassian Cloud authenticates via Basic auth with email:api-token base64-encoded.
function authHeader() {
  const email = process.env.JIRA_USER_EMAIL || 'pulse-bot@somewearlabs.com';
  const token = process.env.JIRA_API_TOKEN;
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Create a Jira issue with retry-on-5xx.
 * Returns { ok: true, key, url } on success;
 *         { ok: false, kind: '4xx'|'5xx', status, message } on failure.
 */
async function createIssue({ project, issueType, summary, description, labels }) {
  const TRUNCATED_SUMMARY = truncate(summary, 255);
  const body = {
    fields: {
      project: { key: project },
      issuetype: { name: issueType },
      summary: TRUNCATED_SUMMARY,
      description: description, // ADF in production; spec defers richer description format
      labels: labels
    }
  };

  const delays = [1000, 2000, 4000];
  let lastErr = null;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(`${BASE_URL}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader(),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(SCENARIO ? { 'X-Mock-Scenario': SCENARIO } : {})
      },
      body: JSON.stringify(body)
    });
    if (res.status === 201) {
      const json = await res.json();
      return {
        ok: true,
        key: json.key,
        url: `${BASE_URL}/browse/${json.key}`
      };
    }
    const text = await res.text();
    let message = text;
    try { const j = JSON.parse(text); message = (j.errorMessages || []).join('; ') || text; } catch {}

    if (res.status >= 400 && res.status < 500) {
      return { ok: false, kind: '4xx', status: res.status, message };
    }
    // 5xx or 429 → retry
    lastErr = { kind: '5xx', status: res.status, message };
    if (attempt < delays.length) await sleep(delays[attempt]);
  }
  return { ok: false, ...lastErr };
}

function truncate(s, maxLen) {
  if (!s) return s;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).replace(/\s+$/, '') + '…';
}

module.exports = { createIssue, truncate };
