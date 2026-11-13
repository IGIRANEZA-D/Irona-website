'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { validators } = require('../database');

test('MongoDB validators are defined for the new authoritative collections', () => {
  for (const collection of ['content_items', 'opportunities', 'program_registrations', 'application_drafts', 'audit_events', 'users', 'applications', 'notifications']) {
    assert.ok(validators[collection], `missing ${collection} validator`);
    assert.equal(validators[collection].$jsonSchema.bsonType, 'object');
  }
  assert.deepEqual(validators.application_drafts.$jsonSchema.required, ['tokenHash', 'opportunityId', 'expiresAt', 'values']);
});

test('migration dry run reports partitioned sources without exposing record contents', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'migrate-to-mongodb.js')], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.mode, 'dry-run');
  assert.equal(output.report.destinations.content_items + output.report.destinations.opportunities, output.report.sources.content);
  assert.equal(output.report.destinations.program_registrations, output.report.sources.registrations);
  assert.equal(output.report.destinations.applications, output.report.sources.applications);
  assert.ok(Object.values(output.report.invalid).every(value => value === 0));
  assert.equal(output.report.unresolvedRelationships.applications, 1);
  assert.match(output.report.relationshipIssues[0].applicationIdHash, /^[a-f0-9]{12}$/);
  assert.equal(/@/.test(result.stdout), false);
});
