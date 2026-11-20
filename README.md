# Klaudius (clone)

A **personal, honesty-first tool** for generating private one-page website previews from details you supply, drafting short pitch messages from those details, and reviewing them before anything becomes public or gets sent.

It is deliberately small: vanilla JS, zero npm dependencies, and one serverless function per API file. There are 12 API function files (including `_db.js`); no new API files were added.

## Honesty rules

- **No discovery or gathering.** The tool never claims it found or researched a business. You add leads yourself and state where they came from.
- **No invented details.** Site HTML renders only fields that were supplied. No phone numbers, addresses, hours, photos or claims are fabricated.
- **No unexplained scores.** A lead score above zero requires a `score_basis` explaining it.
- **No fake sends or replies.** Clients cannot set `sent_at`, `replied_at`, `reply_text` or any provider/message ID. The only send state is `sent_by_user`, recorded by the server with a real timestamp when *you* confirm you sent the message yourself.
- **No automatic publishing.** Every generated site starts as `status='preview'`. `published_at` is only written by the server when you explicitly approve publishing.
- **Samples are labelled.** Region-only free builds create `intake_status='sample'` leads that never enter the real queue.

## Setup

1. Set `DATABASE_URL` for a Neon Postgres database (in `.env.local` for local dev, or as a Vercel environment variable).
2. Deploy with the existing `vercel.json`. `api/*.js` are the serverless functions; `app/` and `public/` are static.
3. Open the app at `/`. The dashboard is at `/app/index.html`; `/public/index.html` is an honest pointer page.

No secrets are printed or written by the code. Do not commit `.env.local` (it is gitignored).

## Exact workflow

1. **Targets (optional).** Add a region as a label. Adding a target does not discover anything.
2. **Intake.** In *Leads → Add verified lead*, enter a business you know. `Source` is required. `Source URL` and a `score_basis` (when scoring) are recorded. The verification checkbox is your own confirmation that you checked the details; it sets `verified_at` and `intake_status='verified'`. Leads without this are `unverified` and their automation buttons are disabled.
3. **Build.** In *Leads*, press **Build preview** on a verified lead (or use *Dashboard → Build a preview from real details*). The server resolves the design from the lead's stored details, derives the site URL from the request host / `VERCEL_URL` (with a local fallback), and stores a private `preview` site with a token. No site is publicly served yet.
4. **Draft.** Press **Pitch draft** on a verified lead that has a preview. The server creates a draft using **only** `lead.name`, `lead.details.services` and `site.url`, stores a `source_snapshot` of those fields, and queues a review task. Nothing is sent.
5. **Runs (bulk).** **Start run** executes the honest phases `intake → build → draft → review → done`. It processes only verified leads that have no site, generates previews, creates grounded drafts, queues review tasks, and stores a real result object:
   ```json
   { "sitesGenerated": 0, "draftsCreated": 0, "reviewTasksQueued": 0, "errors": [] }
   ```
   The run never claims a find/gather step, never publishes, and never sends.
6. **Review.** The *Review* section lists queued items with their provenance (source, verification, fields used, site URL, services) and offers:
   - **Approve & publish** for a site preview (makes it publicly served, writes `published_at`).
   - **Approve draft** (approval only — still not sent).
   - **Confirm manual send** (records `sent_by_user`, `sent_at` and your note).
   - **Draft follow-up** (next grounded sequence step, max 5), **Snooze** or **Dismiss**.
7. **Sending.** The email links are labelled "Opens email client; does not send". You copy/send the message yourself. The mailto link does not transmit anything on your behalf.

## Preview links

Public route `/site/<slug>` serves **only** sites with `status='published'`. A private preview is served only via `/api/site?slug=<slug>&token=<token>`, where the token is generated per site. Preview pages are `noindex` and `no-store`. Do not share preview links unless you intend to.

## Data added

- `leads`: `source`, `source_url`, `verified_at`, `intake_status`, `score_basis`.
- `sites`: `preview_token`.
- `outreach`: `site_id`, `approval_status`, `approved_at`, `approved_by`, `source_snapshot`, `next_follow_up_at`, `send_note`.
- New tables: `lead_events` (audit trail) and `review_tasks` (the review/follow-up queue).

Migrations use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` after the `CREATE TABLE IF NOT EXISTS` loop, so existing databases are upgraded on first request.

## Limits

- Vercel Hobby plan: 12 functions, all currently used. No new `api/*.js` files were added.
- No paid services, no telephony, no email provider, no background workers. Runs execute inside the POST request.
- The tool does not verify business information, discover leads, monitor replies, or answer calls. The receptionist screen is a labelled demo script only.
- Single-user demo identity (`demo-user`). There is no multi-user authentication.
- The review queue is a database table, not a real message broker; it is fine for personal use.

## Checks

There are no npm dependencies. Syntax-check the changed JavaScript directly:

```sh
node --check api/_db.js
node --check api/builder.js
node --check api/freebuild.js
node --check api/leads.js
node --check api/outreach.js
node --check api/runs.js
node --check api/site.js
node --check api/sites.js
node --check app/app.js
```

`package.json` also contains `npm run check` / `npm run smoke` helpers; the smoke script is not part of this repository, so use the explicit `node --check` commands above.
