'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

async function main() {
  const uri = process.env.MONGODB_URI;
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!uri || !email) throw new Error('MONGODB_URI or ADMIN_EMAIL is not configured.');

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || 'irona_portal');
    const users = db.collection('users');
    const admins = await users.find({ email, role: 'admin', primaryAdmin: true, disabled: { $ne: true } }, { projection: { _id: 1 } }).limit(2).toArray();
    if (admins.length !== 1) throw new Error('Expected exactly one active admin matching configured ADMIN_EMAIL.');

    const password = crypto.randomBytes(24).toString('base64url');
    const passwordHash = await bcrypt.hash(password, 12);
    let suspendedCount = 0;
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        const result = await users.updateOne(
          { _id: admins[0]._id, role: 'admin', primaryAdmin: true, disabled: { $ne: true } },
          { $set: { passwordHash, passwordUpdatedAt: new Date(), updatedAt: new Date() }, $inc: { sessionVersion: 1 } },
          { session },
        );
        if (result.modifiedCount !== 1) throw new Error('The admin password was not updated.');
        const suspended = await users.updateMany(
          { invitedAccount: true, primaryAdmin: { $ne: true }, accessStatus: { $ne: 'suspended' } },
          { $set: { accessStatus: 'suspended', accessSuspendedAt: new Date(), suspensionReason: 'primary-admin-password-reset' }, $unset: { passwordHash: '', credentialExpiresAt: '' }, $inc: { sessionVersion: 1 } },
          { session },
        );
        suspendedCount = suspended.modifiedCount;
        await db.collection('security_tokens').deleteMany({ type: 'staff-invitation' }, { session });
        await db.collection('audit_events').insertOne({ action: 'user.password.reset.cli', actorId: admins[0]._id.toString(), targetType: 'user', targetId: admins[0]._id.toString(), metadata: { suspendedCount }, createdAt: new Date() }, { session });
      });
    } finally { await session.endSession(); }

    console.log(`Primary admin password updated for ${email}. ${suspendedCount} invited team account(s) were suspended; their profiles remain for re-invitation.`);
    console.log('The password was stored as a bcrypt hash. Save this generated password securely:');
    console.log(password);
  } finally {
    await client.close();
  }
}

main().catch(error => {
  const code = error.code ? ` (${error.code})` : '';
  console.error(`Admin password update failed: ${error.message}${code}`);
  process.exitCode = 1;
});
