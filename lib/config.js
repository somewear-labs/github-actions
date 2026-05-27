const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;

const schemaPath = path.join(__dirname, '..', 'schema', 'jira-title.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Load and validate per-repo config from the PR's base ref.
 * Returns { found: false } if no config file, { ok: true, config } if valid,
 * { ok: false, errors } if invalid.
 */
async function loadConfig({ github, context }) {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name || context.payload.repository.full_name.split('/')[1];
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

  let parsed;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    return { ok: false, errors: [`YAML parse error: ${err.message}`] };
  }

  const ok = validate(parsed);
  if (!ok) {
    return { ok: false, errors: validate.errors.map(e => `${e.instancePath || '(root)'} ${e.message}`) };
  }
  return { found: true, ok: true, config: parsed };
}

module.exports = { loadConfig };
