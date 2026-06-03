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

// Upper bound on how long we'll obey a server-supplied Retry-After. Anything
// past this and we fall back to our own backoff schedule — partly to bound
// total job runtime, partly to defend against pathological values from a
// misbehaving server.
const RETRY_AFTER_MAX_MS = 30_000;

/**
 * Parse the value of a Retry-After response header. Supports the
 * delta-seconds form only (an integer number of seconds) — Atlassian Cloud
 * never emits the HTTP-date form, and supporting that would add a parsing
 * surface we don't need.
 *
 * Returns the delay in milliseconds, clamped to RETRY_AFTER_MAX_MS, or
 * null if the header is absent / unparseable / non-positive.
 */
function parseRetryAfter(headerValue) {
  if (!headerValue) return null;
  const seconds = parseInt(String(headerValue).trim(), 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.min(seconds * 1000, RETRY_AFTER_MAX_MS);
}

/**
 * Convert plain-text description into Atlassian Document Format (ADF).
 *
 * Jira Cloud REST API v3 requires the `description` field to be an ADF
 * document, not a raw string. API v2 accepted strings, but v2 is the older
 * surface — we use v3 throughout.
 *
 * Mapping is intentionally simple:
 *   - Double-newline (`\n\n+`) starts a new paragraph block
 *   - Single newline within a paragraph becomes a hardBreak inline node
 *   - Empty paragraphs after trimming are skipped
 *
 * The PR-body content is GitHub-flavored Markdown; this mapping preserves
 * line breaks but does NOT convert Markdown syntax to ADF formatting. PRs
 * with rich Markdown will appear as plain text in Jira. Acceptable for v1;
 * richer mapping can be added if it becomes a friction point.
 */
function textToAdf(text) {
  if (!text) return { type: 'doc', version: 1, content: [] };

  const paragraphs = String(text).split(/\n\n+/);
  const content = paragraphs
    .map(p => p.replace(/\s+$/, ''))
    .filter(p => p.length > 0)
    .map(paragraph => {
      const lines = paragraph.split('\n');
      const inline = [];
      lines.forEach((line, i) => {
        if (i > 0) inline.push({ type: 'hardBreak' });
        if (line.length > 0) inline.push({ type: 'text', text: line });
      });
      // ADF rejects paragraphs whose content array is empty.
      if (inline.length === 0) return null;
      return { type: 'paragraph', content: inline };
    })
    .filter(Boolean);

  return { type: 'doc', version: 1, content };
}

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
      description: textToAdf(description),
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

    // 429 is technically 4xx but it's a rate-limit signal → treat as
    // retryable. Real 4xx (auth, validation, not-found) is non-retryable.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      return { ok: false, kind: '4xx', status: res.status, message };
    }

    // 5xx or 429 → retry. Honor Retry-After if the server sent one;
    // otherwise fall back to our fixed exponential schedule.
    lastErr = { kind: '5xx', status: res.status, message };
    if (attempt < delays.length) {
      const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
      const delayMs = retryAfterMs != null ? retryAfterMs : delays[attempt];
      await sleep(delayMs);
    }
  }
  return { ok: false, ...lastErr };
}

function truncate(s, maxLen) {
  if (!s) return s;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1).replace(/\s+$/, '') + '…';
}

module.exports = { createIssue, truncate, textToAdf, parseRetryAfter, RETRY_AFTER_MAX_MS };
