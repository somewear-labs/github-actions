#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const Ajv = require('ajv').default;
const addFormats = require('ajv-formats').default;

const schema = JSON.parse(fs.readFileSync('schema/jira-title.schema.json', 'utf8'));
const ajv = new Ajv({ allErrors: true, useDefaults: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const cases = [
  { file: 'fixtures/config-cases/valid-minimal.yml', expect: 'valid' },
  { file: 'fixtures/config-cases/valid-full.yml', expect: 'valid' },
  { file: 'fixtures/example-jira-title.yml', expect: 'valid' },
  { file: 'fixtures/config-cases/invalid-missing-project.yml', expect: 'invalid' },
  { file: 'fixtures/config-cases/invalid-bad-mode.yml', expect: 'invalid' },
  { file: 'fixtures/config-cases/invalid-extra-field.yml', expect: 'invalid' }
];

let failed = 0;
for (const c of cases) {
  const data = yaml.load(fs.readFileSync(c.file, 'utf8'));
  const ok = validate(data);
  const got = ok ? 'valid' : 'invalid';
  const pass = got === c.expect;
  if (!pass) {
    failed++;
    console.error(`FAIL: ${c.file} — expected ${c.expect}, got ${got}`);
    if (!ok) console.error('  errors:', JSON.stringify(validate.errors, null, 2));
  } else {
    console.log(`OK:   ${c.file} (${got})`);
  }
}
if (failed > 0) {
  console.error(`\n${failed} schema test case(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} schema test cases passed`);
