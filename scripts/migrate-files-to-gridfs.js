'use strict';

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { MongoClient, GridFSBucket } = require('mongodb');

const root = path.resolve(__dirname, '..');
const uploadRoot = path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads'));
const mediaRoot = path.join(uploadRoot, 'cms-media');
const privateRoots = [path.join(uploadRoot, 'cms-applications'), uploadRoot];
const apply = process.argv.includes('--apply');
const mimeByExtension = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
function collectFiles(directory, recursive = false) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && recursive) return collectFiles(file, recursive);
    if (!entry.isFile() || !mimeByExtension[path.extname(entry.name).toLowerCase()]) return [];
    return [{ file, filename: entry.name }];
  });
}
const publicFiles = collectFiles(mediaRoot);
const privateFiles = [...new Map(privateRoots.flatMap(directory => collectFiles(directory, directory.endsWith('cms-applications'))).map(row => [row.filename, row])).values()]
  .filter(row => !path.resolve(row.file).startsWith(path.resolve(mediaRoot) + path.sep));
const summary = {
  mode: apply ? 'apply' : 'dry-run',
  publicMedia: { files: publicFiles.length, bytes: publicFiles.reduce((sum, row) => sum + fs.statSync(row.file).size, 0) },
  privateApplicationFiles: { files: privateFiles.length, bytes: privateFiles.reduce((sum, row) => sum + fs.statSync(row.file).size, 0) },
  originalsRetained: true,
};

async function copyFiles(bucket, files, isPrivate) {
  let copied = 0;
  let alreadyPresent = 0;
  for (const row of files) {
    const existing = await bucket.find({ filename: row.filename }).limit(1).next();
    if (existing) { alreadyPresent++; continue; }
    const extension = path.extname(row.filename).toLowerCase();
    const originalName = isPrivate ? path.basename(row.filename) : path.basename(row.filename);
    const stream = bucket.openUploadStream(row.filename, {
      metadata: { contentType: mimeByExtension[extension], originalName, private: isPrivate, migratedAt: new Date() },
    });
    await new Promise((resolve, reject) => {
      stream.once('finish', resolve);
      stream.once('error', reject);
      fs.createReadStream(row.file).pipe(stream);
    });
    copied++;
  }
  return { copied, alreadyPresent };
}

async function main() {
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 2, serverSelectionTimeoutMS: 10000 });
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || 'irona_portal');
    const result = {
      publicMedia: await copyFiles(new GridFSBucket(db, { bucketName: 'cms_public_media' }), publicFiles, false),
      privateApplicationFiles: await copyFiles(new GridFSBucket(db, { bucketName: 'private_application_files' }), privateFiles, true),
    };
    console.log(JSON.stringify({ result, originalsRetained: true }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch(error => { console.error(`File migration failed: ${error.message}`); process.exitCode = 1; });
