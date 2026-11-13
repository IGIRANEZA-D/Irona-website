'use strict';

const { MongoClient } = require('mongodb');

const validators = {
  content_items: { $jsonSchema: { bsonType: 'object', required: ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt'], properties: { id: { bsonType: 'string' }, type: { enum: ['publication', 'news', 'event'] }, title: { bsonType: 'string', minLength: 3, maxLength: 180 }, status: { enum: ['draft', 'published', 'closed'] }, deletedAt: { bsonType: ['string', 'null'] }, createdAt: { bsonType: ['date', 'string'] }, updatedAt: { bsonType: ['date', 'string'] } } } },
  opportunities: { $jsonSchema: { bsonType: 'object', required: ['id', 'type', 'title', 'status', 'createdAt', 'updatedAt'], properties: { id: { bsonType: 'string' }, type: { enum: ['vacancy', 'program', 'job', 'consultancy'] }, title: { bsonType: 'string', minLength: 3, maxLength: 180 }, status: { enum: ['draft', 'published', 'closed', 'open'] }, createdAt: { bsonType: ['date', 'string'] }, updatedAt: { bsonType: ['date', 'string'] } } } },
  program_registrations: { $jsonSchema: { bsonType: 'object', required: ['id', 'programId', 'email', 'submittedAt'], properties: { id: { bsonType: 'string' }, programId: { bsonType: 'string' }, email: { bsonType: 'string' }, submittedAt: { bsonType: ['date', 'string'] } } } },
  application_drafts: { $jsonSchema: { bsonType: 'object', required: ['tokenHash', 'opportunityId', 'expiresAt', 'values'], properties: { tokenHash: { bsonType: 'string' }, opportunityId: { bsonType: 'string' }, expiresAt: { bsonType: 'date' }, values: { bsonType: 'object' } } } },
  audit_events: { $jsonSchema: { bsonType: 'object', required: ['action', 'createdAt'], properties: { action: { bsonType: 'string' }, actorId: { bsonType: ['string', 'null'] }, targetType: { bsonType: ['string', 'null'] }, targetId: { bsonType: ['string', 'null'] }, createdAt: { bsonType: 'date' } } } },
  users: { $jsonSchema: { bsonType: 'object', required: ['email', 'role'], properties: { email: { bsonType: 'string', minLength: 3, maxLength: 254 }, role: { enum: ['admin', 'staff', 'applicant'] }, name: { bsonType: 'string', maxLength: 100 }, passwordHash: { bsonType: 'string' }, primaryAdmin: { bsonType: 'bool' }, invitedAccount: { bsonType: 'bool' }, accessRoles: { bsonType: 'array', items: { enum: ['administrator', 'hr', 'content-publisher', 'program-application-manager'] } }, accessStatus: { enum: ['active', 'invited', 'expired', 'suspended'] }, credentialExpiresAt: { bsonType: ['date', 'null'] }, avatarUrl: { bsonType: 'string', maxLength: 500 }, profilePhotoId: { bsonType: 'objectId' }, sessionVersion: { bsonType: 'int' } } } },
  applications: { $jsonSchema: { bsonType: 'object', properties: { applicantId: { bsonType: ['objectId', 'null'] }, opportunityId: { bsonType: ['objectId', 'string', 'null'] }, status: { bsonType: ['string', 'null'] }, createdAt: { bsonType: ['date', 'string', 'null'] } } } },
  notifications: { $jsonSchema: { bsonType: 'object', properties: { userId: { bsonType: ['objectId', 'string', 'null'] }, read: { bsonType: ['bool', 'null'] }, createdAt: { bsonType: ['date', 'string', 'null'] } } } },
};

async function duplicateCount(collection, key, filter = {}) {
  const pipeline = [];
  if (Object.keys(filter).length) pipeline.push({ $match: filter });
  pipeline.push({ $group: { _id: key, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 1 });
  const rows = await collection.aggregate(pipeline).toArray();
  return rows.length > 0;
}

async function safeCreateIndex(collection, key, options, logger) {
  const existing = await collection.listIndexes().toArray();
  const same = existing.find(index => JSON.stringify(index.key) === JSON.stringify(key));
  if (same) {
    if (options.unique && !same.unique) logger.error(`Skipped unique index ${options.name}: an incompatible non-unique index already exists.`);
    return same.name;
  }
  return collection.createIndex(key, options);
}

async function initializeDatabase({ uri, databaseName, logger = console }) {
  const client = new MongoClient(uri, { maxPoolSize: 5, minPoolSize: 0, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(databaseName);
  for (const [name, validator] of Object.entries(validators)) {
    const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
    if (!exists) {
      try { await db.createCollection(name, { validator, validationLevel: 'moderate', validationAction: 'error' }); }
      catch (error) { if (error.code !== 48 && error.codeName !== 'NamespaceExists') throw error; }
    }
  }
  const users = db.collection('users');
  if (!await duplicateCount(users, '$email')) await safeCreateIndex(users, { email: 1 }, { unique: true, name: 'users_email_unique' }, logger);
  else logger.error('Skipped users.email unique index: duplicate values require review.');
  await safeCreateIndex(users, { accessStatus: 1, credentialExpiresAt: 1, createdAt: -1 }, { name: 'users_team_access_expiry' }, logger);
  const content = db.collection('content_items');
  if (!await duplicateCount(content, '$id')) await safeCreateIndex(content, { id: 1 }, { unique: true, name: 'content_id_unique' }, logger);
  else logger.error('Skipped content_items.id unique index: duplicate values require review.');
  const opportunities = db.collection('opportunities');
  if (!await duplicateCount(opportunities, '$id')) await safeCreateIndex(opportunities, { id: 1 }, { unique: true, name: 'opportunity_id_unique' }, logger);
  else logger.error('Skipped opportunities.id unique index: duplicate values require review.');
  await Promise.all([
    safeCreateIndex(content, { type: 1, status: 1, publishAt: -1, deletedAt: 1 }, { name: 'content_public_listing' }, logger),
    safeCreateIndex(opportunities, { type: 1, status: 1, closesAt: 1 }, { name: 'opportunity_public_listing' }, logger),
    (async () => { const c = db.collection('program_registrations'); if (!await duplicateCount(c, { programId: '$programId', emailNormalized: '$emailNormalized' })) await safeCreateIndex(c, { programId: 1, emailNormalized: 1 }, { unique: true, name: 'registration_program_email_unique' }, logger); else logger.error('Skipped program registration unique index: duplicate pairs require review.'); })(),
    (async () => { const c = db.collection('applications'); if (!await duplicateCount(c, { opportunityId: '$opportunityId', emailNormalized: '$emailNormalized' }, { source: 'cms' })) await safeCreateIndex(c, { opportunityId: 1, emailNormalized: 1 }, { unique: true, name: 'cms_application_opportunity_email_unique', partialFilterExpression: { source: 'cms' } }, logger); else logger.error('Skipped CMS application unique index: duplicate opportunity/email pairs require review.'); })(),
    safeCreateIndex(db.collection('application_drafts'), { expiresAt: 1 }, { expireAfterSeconds: 0, name: 'application_draft_ttl' }, logger),
    safeCreateIndex(db.collection('application_drafts'), { tokenHash: 1 }, { unique: true, name: 'application_draft_token_unique' }, logger),
    safeCreateIndex(db.collection('audit_events'), { createdAt: -1 }, { name: 'audit_created_desc' }, logger),
    (async () => { const c = db.collection('applications'); if (!await duplicateCount(c, { opportunityId: '$opportunityId', applicantId: '$applicantId' }, { applicantId: { $exists: true } })) await safeCreateIndex(c, { opportunityId: 1, applicantId: 1 }, { unique: true, name: 'applications_opportunity_applicant_unique' }, logger); else logger.error('Skipped applicant application unique index: duplicate pairs require review.'); })(),
    safeCreateIndex(db.collection('applications'), { applicantId: 1, createdAt: -1 }, { name: 'applications_applicant_created' }, logger),
    safeCreateIndex(db.collection('applications'), { status: 1, createdAt: -1 }, { name: 'applications_status_created' }, logger),
    safeCreateIndex(db.collection('notifications'), { userId: 1, createdAt: -1 }, { name: 'notifications_user_created' }, logger),
  ]);
  return { client, db };
}

module.exports = { initializeDatabase, validators };
