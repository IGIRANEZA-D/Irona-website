'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient } = require('mongodb');
const { serialize } = require('bson');
const { validators } = require('../database');

const root = path.resolve(__dirname, '..');
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads'));
const sources = {
  content: path.join(uploadRoot, 'cms-content.json'),
  applications: path.join(uploadRoot, 'cms-vacancy-applications.json'),
  drafts: path.join(uploadRoot, 'cms-application-drafts.json'),
  registrations: path.join(root, 'data', 'program-registrations.json'),
};
const readArray = file => {
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`Expected an array in ${path.relative(root, file)}.`);
  return value;
};
const source = Object.fromEntries(Object.entries(sources).map(([key, file]) => [key, readArray(file)]));
const contentItems = source.content.filter(item => !['vacancy', 'program'].includes(item.type)).map(item => ({ ...item, source: 'cms' }));
const canonicalOpportunities = source.content.filter(item => ['vacancy', 'program'].includes(item.type)).map(item => ({ ...item, source: 'cms' }));
const registrations = source.registrations.map(item => ({ ...item, id: String(item.id), programId: String(item.programId), email: String(item.email || '').trim(), emailNormalized: String(item.email || '').trim().toLowerCase(), submittedAt: item.submittedAt ? new Date(item.submittedAt) : new Date() }));
const cmsOpportunityIds = new Set(canonicalOpportunities.map(item => String(item.id)));
const cmsApplications = source.applications.map(item => {
  const opportunityId = String(item.contentId || item.vacancyId || '');
  return { ...item, legacyId: String(item.id), opportunityId, relationshipStatus: cmsOpportunityIds.has(opportunityId) ? 'linked' : 'unresolved', emailNormalized: String(item.email || '').trim().toLowerCase(), source: 'cms', createdAt: item.submittedAt ? new Date(item.submittedAt) : new Date(), updatedAt: item.submittedAt ? new Date(item.submittedAt) : new Date() };
});
const drafts = source.drafts.filter(item => /^[a-f0-9]{64}$/.test(String(item.token || ''))).map(item => {
  const { token, contentId, ...rest } = item;
  return { ...rest, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), opportunityId: String(contentId), expiresAt: new Date(item.expiresAt), source: 'cms' };
});
const report = {
  sources: Object.fromEntries(Object.entries(source).map(([key, rows]) => [key, rows.length])),
  destinations: { content_items: contentItems.length, opportunities: canonicalOpportunities.length, applications: cmsApplications.length, program_registrations: registrations.length, application_drafts: drafts.length },
  invalid: {
    contentWithoutId: source.content.filter(item => !item.id).length,
    registrationsWithoutEmail: registrations.filter(item => !item.emailNormalized).length,
    draftsWithoutValidToken: source.drafts.length - drafts.length,
    registrationsWithoutProgram: registrations.filter(item => !cmsOpportunityIds.has(item.programId) || !canonicalOpportunities.some(opportunity => String(opportunity.id) === item.programId && opportunity.type === 'program')).length,
    draftsWithoutOpportunity: drafts.filter(item => !cmsOpportunityIds.has(item.opportunityId)).length,
  },
  unresolvedRelationships: { applications: cmsApplications.filter(item => item.relationshipStatus === 'unresolved').length },
  relationshipIssues: cmsApplications.filter(item => item.relationshipStatus === 'unresolved').map(item => ({ applicationIdHash: crypto.createHash('sha256').update(item.legacyId).digest('hex').slice(0, 12), opportunityIdHash: crypto.createHash('sha256').update(item.opportunityId).digest('hex').slice(0, 12), reason: 'No current CMS vacancy/program has this legacy ID.' })),
  duplicateSourceKeys: {
    content: source.content.length - new Set(source.content.map(item => item.id).filter(Boolean)).size,
    applications: source.applications.length - new Set(source.applications.map(item => item.id).filter(Boolean)).size,
    registrations: registrations.length - new Set(registrations.map(item => `${item.programId}\0${item.emailNormalized}`)).size,
    drafts: drafts.length - new Set(drafts.map(item => item.tokenHash)).size,
  },
};

async function main() {
  const apply = process.argv.includes('--apply');
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', report }, null, 2));
  if (!apply) return;
  if (Object.values(report.invalid).some(Boolean) || Object.values(report.duplicateSourceKeys).some(Boolean)) throw new Error('Source data has invalid or duplicate keys. Review the dry-run report before migration.');
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required for migration.');
  const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'irona_portal');
    const conflicts = [];
    const preflight = async (collectionName, rows, key, fields) => {
      const collection = db.collection(collectionName);
      for (const row of rows) {
        const old = await collection.findOne({ [key]: row[key] });
        if (old && fields.some(field => JSON.stringify(old[field] ?? null) !== JSON.stringify(row[field] ?? null))) conflicts.push({ collection: collectionName, key: row[key] });
      }
    };
    await preflight('content_items', contentItems, 'id', ['type', 'title', 'summary', 'content', 'status']);
    await preflight('opportunities', canonicalOpportunities, 'id', ['type', 'title', 'summary', 'content', 'status']);
    await preflight('applications', cmsApplications, 'legacyId', ['emailNormalized', 'contentId', 'submittedAt']);
    await preflight('program_registrations', registrations, 'id', ['emailNormalized', 'programId', 'submittedAt']);
    await preflight('application_drafts', drafts, 'tokenHash', ['opportunityId', 'expiresAt']);
    if (conflicts.length) throw new Error(`Found ${conflicts.length} destination ID conflicts. No migration writes were made.`);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(root, '.migration-backups', stamp);
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
    for (const [key, file] of Object.entries(sources)) if (fs.existsSync(file)) fs.copyFileSync(file, path.join(backupDir, `${key}.json`));
    const collections = ['users', 'opportunities', 'applications', 'notifications', 'content_items', 'program_registrations', 'application_drafts'];
    const snapshotCounts = {};
    for (const name of collections) {
      const snapshotFile = path.join(backupDir, `mongodb-${name}.bsonseq`);
      const cursor = db.collection(name).find({}).batchSize(250);
      let count = 0;
      for await (const row of cursor) { fs.appendFileSync(snapshotFile, serialize(row), { mode: 0o600, flag: count ? 'a' : 'wx' }); count++; }
      if (!count) fs.writeFileSync(snapshotFile, Buffer.alloc(0), { mode: 0o600, flag: 'wx' });
      snapshotCounts[name] = count;
    }
    for (const name of Object.keys(validators)) {
      const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
      if (!exists) await db.createCollection(name, { validator: validators[name], validationLevel: 'moderate', validationAction: 'error' });
    }
    const upsertBy = async (name, rows, key) => {
      let inserted = 0, skipped = 0;
      for (const row of rows) {
        const value = row[key];
        if (!value || await db.collection(name).findOne({ [key]: value }, { projection: { _id: 1 } })) { skipped++; continue; }
        await db.collection(name).insertOne(row); inserted++;
      }
      return { inserted, skipped };
    };
    const results = {
      content_items: await upsertBy('content_items', contentItems, 'id'),
      opportunities: await upsertBy('opportunities', canonicalOpportunities, 'id'),
      applications: await upsertBy('applications', cmsApplications, 'legacyId'),
      program_registrations: await upsertBy('program_registrations', registrations, 'id'),
      application_drafts: await upsertBy('application_drafts', drafts, 'tokenHash'),
    };
    const after = {};
    for (const name of Object.keys(results)) after[name] = await db.collection(name).countDocuments({});
    const verified = {
      content_items: await db.collection('content_items').countDocuments({ id: { $in: contentItems.map(item => item.id) } }),
      opportunities: await db.collection('opportunities').countDocuments({ id: { $in: canonicalOpportunities.map(item => item.id) } }),
      applications: await db.collection('applications').countDocuments({ legacyId: { $in: cmsApplications.map(item => item.legacyId) } }),
      program_registrations: await db.collection('program_registrations').countDocuments({ id: { $in: registrations.map(item => item.id) } }),
      application_drafts: await db.collection('application_drafts').countDocuments({ tokenHash: { $in: drafts.map(item => item.tokenHash) } }),
    };
    const relationshipVerification = {
      applicationsWithOpportunity: await db.collection('applications').countDocuments({ source: 'cms', legacyId: { $in: cmsApplications.filter(item => item.relationshipStatus === 'linked').map(item => item.legacyId) }, opportunityId: { $in: canonicalOpportunities.map(item => item.id) } }),
      registrationsWithProgram: await db.collection('program_registrations').countDocuments({ id: { $in: registrations.map(item => item.id) }, programId: { $in: canonicalOpportunities.filter(item => item.type === 'program').map(item => item.id) } }),
      draftsWithOpportunity: await db.collection('application_drafts').countDocuments({ tokenHash: { $in: drafts.map(item => item.tokenHash) }, opportunityId: { $in: canonicalOpportunities.map(item => item.id) } }),
    };
    const migrationLog = { at: new Date().toISOString(), report, results, after, snapshotCounts, verified, relationshipVerification };
    fs.writeFileSync(path.join(backupDir, 'migration-report.json'), JSON.stringify(migrationLog, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ backupDir: path.relative(root, backupDir), results, after, verified, relationshipVerification }, null, 2));
    for (const [name, expected] of Object.entries(report.destinations)) if (verified[name] !== expected) throw new Error(`Post-migration verification failed for ${name}; source files and database backup are retained.`);
    if (relationshipVerification.applicationsWithOpportunity !== cmsApplications.filter(item => item.relationshipStatus === 'linked').length || relationshipVerification.registrationsWithProgram !== registrations.length || relationshipVerification.draftsWithOpportunity !== drafts.length) throw new Error('Post-migration relationship verification failed; source files and database backup are retained.');
  } finally { await client.close(); }
}

main().catch(error => { console.error(`Migration failed: ${error.message}`); process.exitCode = 1; });
