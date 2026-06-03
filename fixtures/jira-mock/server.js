const express = require('express');
const scenarios = require('./scenarios');

const app = express();
app.use(express.json());

// Scenario is selected via X-Mock-Scenario header set by the test harness.
// Default = "happy" if not set.
function pickScenario(req) {
  return req.header('X-Mock-Scenario') || 'happy';
}

// Per-scenario retry counter (resets on server restart).
const retryCounters = new Map();

// Apply a scenario's optional headers (e.g. Retry-After) to the response.
function applyHeaders(res, scenarioHeaders) {
  if (!scenarioHeaders) return;
  for (const [name, value] of Object.entries(scenarioHeaders)) {
    res.set(name, value);
  }
}

app.post('/rest/api/3/issue', (req, res) => {
  const name = pickScenario(req);
  const s = scenarios[name];
  if (!s) return res.status(500).json({ errorMessages: [`unknown scenario: ${name}`] });

  if (s.kind === 'success') {
    applyHeaders(res, s.headers);
    return res.status(201).json(s.body);
  }
  if (s.kind === 'error') {
    applyHeaders(res, s.headers);
    return res.status(s.status).json(s.body);
  }
  if (s.kind === 'flake') {
    const count = (retryCounters.get(name) || 0) + 1;
    retryCounters.set(name, count);
    if (count <= s.failTimes) {
      applyHeaders(res, s.headers);
      return res.status(s.status).json(s.body);
    }
    return res.status(201).json(s.successBody);
  }

  // Fallthrough: unknown or missing kind. Fail loudly so the test author
  // gets immediate feedback instead of a hung connection.
  return res.status(500).json({
    errorMessages: [`scenario "${name}" has unknown or missing kind: ${s.kind}`]
  });
});

app.get('/rest/api/3/myself', (req, res) => {
  // health-check endpoint used by some tests
  res.status(200).json({ accountId: 'pulse-bot-mock', displayName: 'pulse-bot (mock)' });
});

const port = process.env.JIRA_MOCK_PORT || 4111;
app.listen(port, () => console.log(`Jira mock listening on http://localhost:${port}`));
