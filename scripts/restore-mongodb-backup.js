'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const { deserialize } = require('bson');

async function main() {
  const backupDir = path.resolve(process.argv[2] || '');
  const apply = process.argv.includes('--apply');
  if (!process.argv[2] || !fs.existsSync(backupDir)) throw new Error('Pass an existing migration backup directory.');
  const uri = process.env.MONGODB_MIGRATION_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('Set a database connection string in the environment.');
  const files = fs.readdirSync(backupDir).filter(name => /^mongodb-[a-z_]+\.bsonseq$/.test(name));
  if (!files.length) throw new Error('No BSON collection snapshots were found in that directory.');
  const client = new MongoClient(uri, { maxPoolSize: 1, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'irona_portal');
    const plan = [];
    for (const file of files) {
      const name = file.slice('mongodb-'.length, -'.bsonseq'.length);
      const size = fs.statSync(path.join(backupDir, file)).size;
      const count = await db.collection(name).countDocuments({});
      plan.push({ collection: name, snapshotBytes: size, destinationDocuments: count });
      if (count) throw new Error(`Restore stopped: ${name} contains ${count} document(s). Use an empty recovery database; this tool never overwrites live records.`);
    }
    console.log(JSON.stringify({ mode: apply ? 'restore' : 'dry-run', targetDatabase: db.databaseName, collections: plan }, null, 2));
    if (!apply) return;
    for (const item of plan) {
      const filename = path.join(backupDir, `mongodb-${item.collection}.bsonseq`);
      const buffer = fs.readFileSync(filename);
      let offset = 0;
      let batch = [];
      while (offset < buffer.length) {
        const length = buffer.readInt32LE(offset);
        if (length < 5 || offset + length > buffer.length) throw new Error(`Corrupt BSON backup for ${item.collection} at byte ${offset}.`);
        batch.push(deserialize(buffer.subarray(offset, offset + length)));
        offset += length;
        if (batch.length === 500) { await db.collection(item.collection).insertMany(batch); batch = []; }
      }
      if (batch.length) await db.collection(item.collection).insertMany(batch);
      console.log(`Restored ${item.collection}: ${await db.collection(item.collection).countDocuments({})} document(s).`);
    }
  } finally { await client.close(); }
}
main().catch(error => { console.error(`Restore failed: ${error.message}`); process.exitCode = 1; });
