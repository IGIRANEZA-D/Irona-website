'use strict';

require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 1, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'irona_portal');
    const queries = {
      publicContent: db.collection('content_items').find({ type: 'publication', status: 'published', deletedAt: { $exists: false } }, { projection: { title: 1, slug: 1, summary: 1 } }).sort({ publishAt: -1 }).limit(20),
      publicOpportunities: db.collection('opportunities').find({ type: 'program', status: 'published', deletedAt: { $exists: false } }, { projection: { title: 1, summary: 1, closesAt: 1 } }).sort({ closesAt: 1 }).limit(20),
      applicantApplications: db.collection('applications').find({ applicantId: new ObjectId('000000000000000000000000') }, { projection: { status: 1, opportunityTitle: 1 } }).sort({ createdAt: -1 }).limit(20),
      applicantNotifications: db.collection('notifications').find({ userId: new ObjectId('000000000000000000000000') }, { projection: { title: 1, read: 1 } }).sort({ createdAt: -1 }).limit(20),
    };
    const result = {};
    for (const [name, cursor] of Object.entries(queries)) {
      const plan = await cursor.explain('executionStats');
      result[name] = { executionStats: plan.executionStats, winningPlan: plan.queryPlanner.winningPlan };
    }
    console.log(JSON.stringify(result, null, 2));
  } finally { await client.close(); }
}
main().catch(error => { console.error(`Explain failed: ${error.message}`); process.exitCode = 1; });
