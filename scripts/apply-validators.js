'use strict';

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { validators } = require('../database');

async function main() {
  const uri = process.env.MONGODB_MIGRATION_URI;
  if (!uri) throw new Error('Set MONGODB_MIGRATION_URI to a short-lived database-administrator connection string.');
  const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'irona_portal');
    for (const [name, validator] of Object.entries(validators)) {
      const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
      if (!exists) await db.createCollection(name, { validator, validationLevel: 'moderate', validationAction: 'error' });
      else await db.command({ collMod: name, validator, validationLevel: 'moderate', validationAction: 'error' });
      console.log(`Validator applied: ${name}`);
    }
  } finally { await client.close(); }
}
main().catch(error => { console.error(`Validator setup failed: ${error.message}`); process.exitCode = 1; });
