const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;
const { repoCoords } = require('./repo-coords');

const schemaPath = path.join(__dirname, '..', 'schema', 'jira-title.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Validate already-parsed-or-YAML config body. Used by both loadConfig() and
 * the act test seam in lib/main.js (maybeMockConfig) so the validation +
 * error-shape contract stays consistent.
 *
 * Returns:
 *   { found: true, ok: true, config }          on valid input
 *   { found: true, ok: false, kind: 'yaml',   errors } on YAML parse failure
 *   { found: true, ok: false, kind: 'schema', errors } on schema violation
 */
function validateConfigBody(rawYaml) {
  let parsed;
  try {
    parsed = yaml.load(rawYaml);
  } catch (err) {
    return { found: true, ok: false, kind: 'yaml', errors: [`YAML parse error: ${err.message}`] };
  }
  const ok = validate(parsed);
  if (!ok) {
    return {
      found: true,
      ok: false,
      kind: 'schema',
      errors: validate.errors.map(e => `${e.instancePath || '(root)'} ${e.message}`)
    };
  }
  return { found: true, ok: true, config: parsed };
}

/**
 * Load and validate per-repo config from the PR's base ref.
 * Returns:
 *   { found: false }                                        no config file in base ref
 *   { found: true, ok: true,  config }                       valid
 *   { found: true, ok: false, kind: 'yaml'|'schema', errors } invalid
 */
async function loadConfig({ github, context }) {
  const { owner, repo } = repoCoords(context);
  const ref = context.payload.pull_request.base.ref;

  let raw;
  try {
    const res = await github.rest.repos.getContent({
      owner, repo, path: '.github/jira-title.yml', ref
    });
    raw = Buffer.from(res.data.content, 'base64').toString('utf8');
  } catch (err) {
    if (err.status === 404) return { found: false };
    throw err;
  }

  return validateConfigBody(raw);
}

module.exports = { loadConfig, validateConfigBody };
