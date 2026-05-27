const BASE_URL = process.env.JIRA_BASE_URL || 'https://somewearlabs.atlassian.net';
const SCENARIO = process.env.MOCK_SCENARIO || '';

// Sentinel error code surfaced when JIRA_API_TOKEN is unset. The orchestrator
// (lib/main.js) translates this into a clear operator-facing 4xx message
// instead of letting Basic-auth send "email:undefined" and getting an
// opaque 401 from Atlassian.
const MISSING_TOKEN_ERROR = 'JIRA_API_TOKEN environment variable is not set. Check the JIRA_API_TOKEN organization secret on the consumer repo.';

// Atlassian Cloud authenticates via Basic auth with email:api-token base64-encoded.
function authHeader() {
  const email = process.env.JIRA_USER_EMAIL || 'pulse-bot@somewearlabs.com';
  const token = process.env.JIRA_API_TOKEN;
  if (!token) {
    const err = new Error(MISSING_TOKEN_ERROR);
    err.code = 'MISSING_JIRA_TOKEN';
    throw err;
  }
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Create a Jira issue with retry-on-5xx.
 * Returns { ok: true, key, url } on success;
 *         { ok: false, kind: '4xx'|'5xx', status, message } on failure.
 */
async function createIssue({ project, issueType, summary, description, labels }) {
  // Validate the token before issuing any network calls so the operator-facing
  // error surfaces before Jira can return an opaque 401.
  let auth;
  try {
    auth = authHeader();
  } catch (err) {
    if (err.code === 'MISSING_JIRA_TOKEN') {
      return { ok: false, kind: '4xx', status: 0, message: err.message };
    }
    throw err;
  }

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
        'Authorization': auth,
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
