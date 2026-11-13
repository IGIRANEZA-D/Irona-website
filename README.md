# IRONA Consultants website and opportunities portal

This workspace contains a responsive IRONA public website, an administrator publishing workspace, and a MongoDB-backed applicant portal.

## Stack

- Public website and portal interface: HTML, CSS and browser JavaScript.
- Backend: Node.js and Express 5.
- Database: MongoDB (local or MongoDB Atlas).
- Authentication: bcrypt password hashes and signed, HTTP-only session cookies.
- Application documents: private files in MongoDB GridFS; metadata and access rules are stored in MongoDB.

## Run locally

1. Install Node.js 24.x.
2. Create a MongoDB database (local MongoDB or Atlas) and allow the server to connect to it.
3. Copy `.env.example` to `.env` and set `MONGODB_URI`, `MONGODB_DB`, a random `JWT_SECRET` of at least 32 characters, and the email, SMTP, and application URL settings. The primary administrator must already exist in MongoDB and match `ADMIN_EMAIL`. Add `GEMINI_API_KEY` to enable Baza IRONA.
4. Run `npm install` and then `npm start`.
5. Open `http://localhost:3000`.

The server does not create a primary administrator automatically. Provision the primary administrator through the approved admin account process before startup. Store `.env` values in the hosting provider's secret settings; never commit `.env`.

Before using an existing CMS database for the first time, run `npm run db:migrate:dry-run`, review any unresolved relationship report, then run `npm run db:migrate:apply`. The original local files are preserved. A production startup refuses to serve an empty CMS database when legacy records still need migration.

## Publishing workspace

- The admin dashboard provides an overview plus separate libraries for vacancies, programs, publications, events, and news.
- New items pass through Details, Story & media, and Review & publish steps. They can be saved as drafts or published/scheduled; cover photos and PDF resources are uploaded through the server.
- When MongoDB is connected, editorial content and CMS vacancies/programs are stored in MongoDB. Public cards use published records from the same database as the applicant portal.
- When MongoDB is unavailable in development, the local presentation workspace can still use `uploads/cms-content.json`; this fallback is not a production data store. Article pages include reading time and increment view counts. Vacancy deadlines show a live days-and-hours countdown.

## Portal behavior

- Public listings include open and closed opportunities; drafts stay private.
- Staff can create, edit, publish, close, reopen, and remove listings. If an opportunity has applications, delete archives and closes it so those records remain available.
- Applicants create a profile, apply to an open opportunity, and see application status updates and messages in their dashboard.
- A CV is required for career listings. PDF, DOC and DOCX files are accepted, with a 3 MB per-file and per-submission upload limit to stay below Vercel's function request limit. Applicant files are stored in a private MongoDB GridFS bucket and are not exposed as public URLs; only authorized staff can download them.
- Staff status changes create an in-dashboard notification for the applicant. Email alerts are not connected yet.

## Baza IRONA assistant

- Baza answers from public website pages and live MongoDB records only. It does not read applicant accounts, application records, CVs, or staff-only data.
- Career, program, and consultancy answers come from non-draft opportunity records. Closing dates are inclusive through the end of the displayed date in Africa/Kigali; Baza reports the remaining days from that time zone.
- Published newsroom content is read from the canonical `content_items` collection. Baza reads only explicitly projected published records and canonical public opportunities; it does not query accounts, applications, drafts, notifications or private files.
- Baza uses Google's Gemini Interactions API with streaming enabled and `store: false`. The visitor’s question and a short conversation history are sent to Gemini for an answer; they are not stored by this application or in Gemini interaction history. Keep `GEMINI_API_KEY` in the server `.env` or hosting secrets, never in browser code. `.env` is ignored by Git.
- In disconnected development preview mode, Baza can read content from the local CMS JSON file. Production requires MongoDB.

## Database architecture and migration

See [docs/database-architecture.md](docs/database-architecture.md) for collection ownership, indexes, schema validation, migration and recovery commands, file privacy, and current deployment limitations. Run `npm run db:migrate:dry-run` before considering `npm run db:migrate:apply`; the apply command creates a local private backup before importing and never deletes source JSON files.

## Vercel deployment

The Express server is exported as a Vercel function and the `public/` directory is served as static assets. Vercel requires the deployment environment to include `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET` (at least 32 characters), and `ADMIN_EMAIL`. Configure `APP_BASE_URL` to the public HTTPS site address; the deployment URL is used automatically for Preview if it is not set. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` for invitations and recovery email. `GEMINI_API_KEY` is optional and enables Baza IRONA.

Before the first deployment, run `npm run db:migrate:dry-run`, review its counts and relationship warnings, then back up MongoDB and run `npm run db:migrate:apply` only after confirming the source and destination. Local files in `data/` and `uploads/` are ignored by Git and are not deployed. For files, run `npm run db:migrate:files:dry-run`, review its counts, then run `npm run db:migrate:files:apply`; originals remain in place. The CMS uses a public GridFS bucket for published media, while applicant documents use a separate private bucket. Back up MongoDB, including GridFS collections, before production.

Set these environment variables separately for Vercel Preview and Production. Ensure Atlas networking permits Vercel function connections and that the MongoDB application user has access only to the IRONA database. Start with `vercel deploy` for a Preview deployment, verify `/api/health`, public content, sign-in, email links, media, private application downloads, and Baza IRONA, and use `vercel deploy --prod` only after the Preview is approved. Uploads are limited to 3 MB per request; larger documents need direct-to-object-storage uploads rather than passing through a Vercel function.

Before launch, confirm MongoDB backups, HTTPS, applicant-data retention, and a privacy notice that reflects actual processing and retention. Verify contact details, service descriptions, partner permissions, and impact figures.

The copy and images are a first design pass based on the provided workspace assets and public IRONA material; review them with IRONA before publication.
