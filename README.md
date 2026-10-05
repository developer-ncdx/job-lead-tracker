# Job Lead Tracker

A small, private React app for reviewing job leads stored in Supabase. Leads
are created by external sources; the UI reads them, keeps them synchronized,
and lets the user sort them by date, track applications, or dismiss jobs.

## What is included

- Temporary no-login public mode for local development
- Owner-scoped Row Level Security
- Responsive lead cards with safe external links
- Newest-first and oldest-first date sorting
- Instant search by job title, company, or source across each job view
- Supabase-backed read status, Applied jobs, and Not interested views with Undo
- Initial fetch, manual refresh, and Supabase Realtime refreshes
- Main navbar with Job leads, Applied jobs, Not interested, and Sync & cron.
  Applied and dismissed jobs are hidden from Job leads until restored with Undo.
  The Sync & cron page shows scheduled health, last successful sync, latest
  attempt, expected next run, per-source outcomes, and recent run history
- Server-side Greenhouse, Ashby, Lever, We Work Remotely, Remotive, Remote OK,
  Jobicy, Himalayas, Arbeitnow, Arbeitnow UK, The Muse, JobTech Sweden,
  EURES, Ayla Government, Nomado24, SmartRecruiters, Workable, Personio, and
  optional Jooble ingestion
- Remote-only software-development role filtering and duplicate prevention
- Source-aware provider posting timestamps and relative date labels
- Loading, empty, stale-data, configuration, and mutation error states
- React, TypeScript, Vite, Tailwind CSS, and shadcn components

## Prerequisites

- Node.js 20.19 or newer
- A Supabase project
- An optional [Jooble API key](https://jooble.org/api/about) for broad global
  search
- An optional [The Muse API key](https://www.themuse.com/developers/api/v2)
  for a higher request allowance; its public endpoint works without one

## 1. Create the database table

Open the Supabase SQL Editor and run these files in order:

1. `supabase/migrations/001_create_job_leads.sql`
2. `supabase/migrations/002_job_source_metadata.sql`
3. `supabase/migrations/003_temporary_public_crud.sql`
4. `supabase/migrations/004_public_imports_without_auth.sql`
5. `supabase/migrations/005_job_lead_priorities.sql`
6. `supabase/migrations/20260929150440_add_source_timestamp_label.sql`
7. `supabase/migrations/20261001120511_job_sync_health.sql`
8. `supabase/migrations/20261001125847_streamline_sync_history_policies.sql`
9. `supabase/migrations/20261005145001_job_lead_application_and_read_state.sql`
10. `supabase/migrations/20261005150341_job_lead_not_interested_state.sql`
11. `supabase/migrations/20261005171708_job_crawl_state.sql`

The migrations create the `job_leads` table, source metadata, timestamp
semantics, duplicate constraint, trigger, Realtime publication entry, grants,
and RLS policies. Migration `003` temporarily permits anonymous read, update,
and delete access so the local app does not require a login. Migration `004`
allows server-side imports to use a null owner in this public mode. Migration
`005` adds priority storage and removes browser delete access.
The sync-health migration creates server-written `job_sync_runs` with read-only
browser grants and owner-scoped RLS. It does not change job cards or lead metadata.
The follow-up migration consolidates its read policies without changing access.
The tracking migrations save read, application, and dismissal states. Applying
clears a dismissal and dismissing clears an application. Undo restores the job
without changing its read state. Imports preserve these user-managed fields.

> **Warning:** public mode exposes every `job_leads` row and its tracking
> settings to anyone who has the project URL and browser key. Do not deploy the
> app publicly while migration `003` is active. Inserts remain server-only.

If this repository is linked to a Supabase project with the Supabase CLI, you
can apply the migration with:

```bash
supabase db push
```

## 2. Configure the app

Copy the example environment file:

```bash
cp .env.example .env.local
```

Set the values from **Project Settings → API**:

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-or-publishable-key
VITE_AUTH_MODE=public

SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Optional in public mode; required after authenticated mode is restored
JOB_LEADS_OWNER_ID=

# Optional
JOOBLE_API_KEY=
THE_MUSE_API_KEY=
```

The anon/publishable key is designed for browser use and is protected by RLS.
The service-role key is only for the Node sync process. Never put a Supabase
`service_role`, Jooble key, The Muse key, or any other secret in a `VITE_`
variable.

Restart the development server after changing environment variables.

## 3. Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Public local mode loads the lead dashboard
without a login.

## Configure job sources

`job-sources.config.json` contains company boards and global public feeds.
Greenhouse, Ashby, and Lever each expose one company board per URL. We Work
Remotely, Remotive, Remote OK, Jobicy, and Himalayas provide broad remote-job
discovery. The Muse adds category-filtered listings, Arbeitnow UK provides a UK
feed, and Ayla aggregates government and contractor openings. SmartRecruiters,
Workable, and Personio consume configured public employer boards. Jooble adds
another global search when `JOOBLE_API_KEY` is present. The multilingual
Arbeitnow Europe, JobTech Sweden, EURES, and Nomado24 feeds are disabled in the
default English-only configuration.

The public-source page and query limits are configured per source. The Muse
public endpoint allows 500 requests per hour without a key and 3,600 with a
registered app key. Retain each source's direct posting link and attribution
when displaying imported jobs.

The sync accepts explicitly remote jobs and rejects hybrid, on-site, and
office-based positions. Its role filter accepts AI, ML, LLM, Bubble.io, software, web,
frontend, backend, full-stack, mobile, AI-agent, agentic, AI-assisted,
automation, platform, DevOps, data, test-automation, programmer, technical
lead, and closely related software-development positions. Adjacent sales,
marketing, recruiting, product-management, generic support, and training roles
are rejected.

## Test the APIs without Supabase

Run the read-only live probe:

```bash
npm run jobs:probe
```

It reports each source's status, fetched count, matching count, remote count,
and timestamp coverage. Missing Jooble credentials are reported as `SKIPPED`,
not failed.

Exercise the complete pipeline without writing:

```bash
npm run jobs:sync:dry
```

## Sync jobs into Supabase

After the migrations and server-only environment values are configured:

```bash
npm run jobs:sync
```

The sync normalizes source data, filters role titles, removes duplicate source
IDs and URLs, preserves existing title/description/URL values, and upserts
source metadata. API timestamps retain their meaning:

- Greenhouse and Ashby: `Published`
- Lever: `Created`
- We Work Remotely, Remotive, Remote OK, Jobicy, and Himalayas: `Published`
- Arbeitnow UK and Personio: `Created`
- The Muse, Ayla, SmartRecruiters, and Workable: `Published`
- Jooble: `Updated`
- Missing source timestamp and label: no date is displayed

For a local recurring process:

```bash
npm run jobs:watch
```

The default interval is 60 minutes because Jobicy limits automated polling to
once per hour. Override it with `JOB_SYNC_INTERVAL_MINUTES` only when every
enabled source permits the chosen interval. The watcher only runs while the
computer/process is active; use a server scheduler or hosted cron for an
always-on deployment. Each provider controls when its upstream data refreshes,
so polling more often does not guarantee newer listings.

## Import job-alert emails

The sync can also read LinkedIn, Indeed, OnlineJobs.ph, and Upwork job-alert messages
from Gmail over IMAP. It only reads recent messages, does not mark them as
read, and sends extracted listings through the same target-role and
remote-only filters as the public sources.

It also reads authenticated Google Alerts from Gmail's Spam folder. OnlineJobs.ph
listings default to remote when a short email snippet omits work-location wording;
explicit onsite or hybrid wording still fails the remote-only filter. Account setup
and promotional messages without supported job links do not produce leads. These
imports cover listings included in the received emails, not every job on each site.

For Google Alerts, use separate queries for these two sites. OnlineJobs.ph does not
need a remote-phrase requirement, and Upwork listings use both `/jobs` and
`/freelance-jobs/apply` paths. Include automation terms explicitly, for example:

```text
site:onlinejobs.ph/jobseekers/job (developer OR "software engineer" OR programmer OR automation OR n8n)
(site:upwork.com/jobs OR site:upwork.com/freelance-jobs/apply) (developer OR "software engineer" OR programmer OR automation OR n8n)
```

These are suggested account settings; changing this file does not update Google
Alerts. Results still depend on Google's indexing and delivery, and the importer
applies the target-role and remote-only filters to the received listings.

When date enrichment is enabled, the importer accepts only an absolute
`JobPosting.datePosted` timestamp published by the provider. LinkedIn relative
labels such as `Just posted` or `Reposted 2 days ago` are stored and displayed
verbatim instead of being converted into an invented timestamp. If neither is
available, the UI clearly displays when the tracker first saw the listing.

Configure a Gmail app password in `.env` (not the normal Google account
password):

```dotenv
JOB_ALERT_EMAIL_ENABLED=true
JOB_ALERT_IMAP_HOST=imap.gmail.com
JOB_ALERT_IMAP_PORT=993
JOB_ALERT_IMAP_SECURE=true
JOB_ALERT_EMAIL_USER=your-gmail-address@gmail.com
JOB_ALERT_EMAIL_APP_PASSWORD=your-16-character-app-password
JOB_ALERT_MAILBOX=INBOX
JOB_ALERT_LOOKBACK_DAYS=14
JOB_ALERT_MAX_MESSAGES=100
JOB_ALERT_ENRICH_POSTED_DATES=true
```

Test extraction locally without writing to Supabase:

```bash
npm run jobs:email:probe
```

An OnlineJobs.ph registration or confirmation message contains no job
listings, so it correctly produces zero leads. The importer will begin
extracting that source when actual OnlineJobs.ph job-alert messages arrive.

## Run the sync with Vercel Cron

### Sync & cron page

The main navbar links to `#job-leads` and `#sync-cron`, including direct links
and browser back/forward navigation. The All jobs and Priority filters stay on
the Job leads page, and their selection is preserved when switching pages.
The separate status page reads the latest 20 attempts, the most recent scheduled
cron run, and the most recent successful or warning-completed run. Local and
manual endpoint syncs never prove scheduled-cron health. It polls every minute
while the tab is open and visible. **Refresh status** reads history only; it does
not start a sync or expose `CRON_SECRET` to the browser.

Apply migration `20261001120511_job_sync_health.sql` and deploy the updated sync
code to enable actual run tracking. Earlier run outcomes cannot be recovered
from job discovery timestamps. A missing history table shows setup instructions
without preventing job imports. History-write failures are logged and returned
as `historyWarning`; actual import failures still trigger the existing failure
email. Interrupted runs stay incomplete rather than becoming a false success.

For the current hourly schedule, a recent successful scheduled run is healthy;
warnings and failed sources remain visible. A run with no completion for over
10 minutes is incomplete, and no scheduled run for over 75 minutes is overdue.
The next hourly time is an expectation from the configured schedule, not proof
that the scheduler will execute. All displayed times use Asia/Manila (PHT).

### Deployment configuration

The production deployment includes a protected Vercel Function at
`/api/cron/sync-job-leads`. `vercel.json` invokes it at the start of every
hour. A run with one or more failed sources returns a failure response and
sends a notification email containing the cron title and source errors.

The same hourly endpoint includes OnlineJobs.ph and Smile & Hire when their
entries in `job-sources.config.json` are enabled. OnlineJobs.ph reads one search
page for each of the five configured keywords and up to six job detail pages
per run. Smile & Hire reads `/jobs` and up to three matching job detail pages.
Requests within each site are sequential with five-second spacing. Inspected
details are cached for 24 hours, and new job IDs take precedence over refreshes.
Both sources retain the existing role and remote-only filters. OnlineJobs.ph
email alerts reuse the same saved job IDs; their additional page enrichment is
disabled while the web adapter is enabled.

The crawler-state migration creates a server-only cache with no browser access.
Each source has an overlap lease and a persisted cooldown. HTTP 401/403 pauses
that site for 24 hours; HTTP 429 honors `Retry-After` or pauses for one hour.
Requests are not retried within a run. Each site appears separately as
`onlinejobsph:web` or `smileandhire:web` in Sync & cron history. Read, applied,
and not-interested states are preserved when existing jobs are refreshed.

Add these server-only variables under **Vercel → Project Settings →
Environment Variables** for the Production environment, then redeploy:

```dotenv
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JOB_LEADS_OWNER_ID=
CRON_SECRET=generate-at-least-16-random-characters

# Optional
JOOBLE_API_KEY=
THE_MUSE_API_KEY=
JOB_SOURCES_CONFIG=job-sources.config.json
JOB_DISABLED_PUBLIC_FEEDS=
JOB_ALERT_EMAIL_ENABLED=true
JOB_ALERT_IMAP_HOST=imap.gmail.com
JOB_ALERT_IMAP_PORT=993
JOB_ALERT_IMAP_SECURE=true
JOB_ALERT_EMAIL_USER=your-gmail-address@gmail.com
JOB_ALERT_EMAIL_APP_PASSWORD=your-16-character-app-password
JOB_ALERT_MAILBOX=INBOX
JOB_ALERT_LOOKBACK_DAYS=14
JOB_ALERT_MAX_MESSAGES=100
JOB_ALERT_ENRICH_POSTED_DATES=true
JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT=6
JOB_SYNC_FAILURE_EMAIL_TO=noxpwr@gmail.com
JOB_SYNC_SMTP_HOST=smtp.gmail.com
JOB_SYNC_SMTP_PORT=465
JOB_SYNC_SMTP_SECURE=true
```

Do not prefix server secrets with `VITE_`. Vercel automatically sends
`CRON_SECRET` as a bearer token when it invokes the endpoint, and the function
rejects requests without the matching token.

The failure notifier sends through Gmail SMTP using the same Gmail address and
app password as the IMAP importer. `JOB_SYNC_FAILURE_EMAIL_TO` defaults to
`JOB_ALERT_EMAIL_USER` when omitted.

If a public feed blocks requests from Vercel, set
`JOB_DISABLED_PUBLIC_FEEDS` to its source key (comma-separated for multiple
feeds). For example, Production currently sets it to `arbeitnowuk` because
that provider returns HTTP 403 to Vercel. Local syncs still use the feed.

The email importer enriches dates for supported non-LinkedIn postings. LinkedIn
pages are requested only by the bounded backfill, avoiding duplicate page
requests for every scanned alert. Each hourly run revisits up to
`JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT` existing LinkedIn rows whose provider
time is empty. The default is deliberately small to avoid LinkedIn request
throttling. It stores only an exact timestamp or relative label returned by
LinkedIn; it never substitutes the email receipt or ingestion time. Run the
same idempotent backfill manually with:

```bash
npm run jobs:backfill:linkedin-dates
```

After redeploying, verify the schedule under **Vercel → Project Settings →
Cron Jobs** and use **View Logs** to inspect each run. The configured hourly
schedule requires Vercel Pro or Enterprise; Hobby projects permit only one cron
invocation per day. For Hobby, change the schedule in `vercel.json` to
`0 0 * * *` before deploying.

## Add leads from an external source

Public-mode leads can use a null owner:

```sql
insert into public.job_leads (user_id, title, description, url)
values (
  null,
  'Senior Product Designer',
  'Remote role focused on B2B workflows.',
  'https://example.com/jobs/senior-product-designer'
);
```

An external server or automation can perform the same insert with a Supabase
service-role client. Keep that credential server-side. Authenticated mode
should instead provide the correct owner UUID.

New rows should appear without a reload through Supabase Realtime. The Refresh
button remains available if a live connection is interrupted.

## Available commands

```bash
npm run dev        # Start the local development server
npm run lint       # Run Oxlint
npm test           # Run the Vitest suite once
npm run test:watch # Run tests in watch mode
npm run build      # Type-check and create a production build
npm run preview    # Preview the production build
npm run jobs:probe # Test configured job APIs without database writes
npm run jobs:email:probe # Test Gmail job alerts without database writes
npm run jobs:sync:dry # Run ingestion without database writes
npm run jobs:sync  # Fetch and upsert matching jobs
npm run jobs:watch # Repeat sync at the configured interval
```

## Troubleshooting

**The app says Supabase is not configured**

Confirm `.env.local` exists, both variables are set, and the development server
was restarted.

**The login screen still appears**

Set `VITE_AUTH_MODE=public` and restart the development server. Missing
`VITE_AUTH_MODE` also defaults to public mode.

**The list is empty**

Run the sync and confirm migration `004` is applied. In authenticated mode,
check that each row's `user_id` matches the signed-in user's UUID.

**Priority changes are denied**

Apply all five migrations and verify the browser is using the anon or
publishable key from the same project.

**New external rows do not appear live**

Confirm `public.job_leads` is enabled under **Database → Publications →
supabase_realtime**, then use Refresh while checking the Realtime configuration.

**Jooble is skipped**

Request a key from Jooble, add it as `JOOBLE_API_KEY` in `.env.local`, and run
`npm run jobs:probe` again. Account registration and acceptance of Jooble's
terms must be completed by the account owner.

**A company feed is empty or fails**

Confirm the employer still uses that ATS and update its board URL in
`job-sources.config.json`. Public ATS APIs do not provide an all-company
directory, so company boards must be configured explicitly.

## Restore authenticated mode

Before deploying publicly, set `VITE_AUTH_MODE=authenticated`, remove the three
`Anonymous users can ...` policies created by migration `003`, and revoke all
`job_leads` privileges from `anon`. The owner-scoped authenticated policies
from migration `001` remain in place.

### OnlineJobs.ph crawling POC

A standalone, manual POC reads one public search page and at most three public
job detail pages, waits five seconds between requests, and saves a JSON preview.
It does not write to the database or run in the scheduled sync. The scheduled
web adapter uses the same parsers with its own bounded request budget and cache.

```sh
node scripts/poc/onlinejobs.mjs --keyword=developer --limit=1
# Optional: --output=/absolute/path/jobs.json (default: /tmp/onlinejobs-poc.json)

# Small batch: developer, automation, n8n, AI engineer, Bubble
node scripts/poc/onlinejobs-batch.mjs
# Continue a stopped batch, preserving completed keywords
node scripts/poc/onlinejobs-batch.mjs --resume
```

The batch reads one search page per keyword and up to three new job pages per
keyword. It deduplicates by job ID before requesting detail pages, spaces all
requests by at least five seconds, and saves results after each completed
keyword to `onlinejobs-poc.local/results.json` (ignored by Git). Each job includes
its discovery keyword and whether its title matches the tracker's role filter.
If a request fails, the batch stops and retains completed keywords' results.
An HTTP 410 (Gone) job detail page is recorded in `skippedJobs` and skipped
without retries; the batch can continue to the other selected jobs. A search
page error or access-denied/rate-limit response still stops the run.

To add the saved results to the dashboard, run the separate one-time importer:

```sh
node scripts/poc/import-onlinejobs.mjs --dry-run
node scripts/poc/import-onlinejobs.mjs
# Optional: --input=/absolute/path/results.json
```

It reads the saved file and writes to the configured Supabase project, without
requesting OnlineJobs.ph pages. It applies the current title and remote-only
filters, skips existing OnlineJobs.ph job IDs across import sources, and leaves
read, applied, and not-interested statuses untouched. New jobs use the
`onlinejobsph` source, searchable as `OnlineJobs.ph`. Displayed update dates stay
as update labels, without inventing a posting time. This importer is not part
of the scheduled sync.

Fields include title, URL, source ID, salary, employment type, weekly hours,
description, and the displayed update date. The update date is not treated as
an original posting date. It stops on HTTP errors other than gone detail pages,
redirects, non-HTML responses, or missing expected content, without retries or
bypassing restrictions. It also
handles HTML arriving as Brotli-compressed bytes without encoding headers.

OnlineJobs.ph terms section 7.4 requires express permission for automated access;
its robots.txt crawl delay does not replace that permission. On October 5, 2026,
the live batch extracted 14 unique jobs across the five starter keywords without
login, including 10 titles matching the tracker's role filter. One expired job
page returned HTTP 410 and was skipped. This verifies a small manual run, not
sustained access or unattended crawling across all keywords.

### Smile & Hire extraction POC

```sh
node scripts/poc/smileandhire.mjs
# Optional: --limit=0..3 (public detail pages; default 1)
# Optional: --output=/absolute/path/results.json
# Import only jobs matching the existing role and remote-only filters
node scripts/poc/smileandhire.mjs --import
# Reuse saved results without making new requests to the job board
node scripts/poc/smileandhire.mjs --import --input=smileandhire-poc.local/results.json
```

This manual POC reads the public `/jobs` HTML and extracts the listing titles,
companies, work style, employment type, compensation, hours, and overview.
It can enrich up to three public job descriptions, waits five seconds between
requests, and stops on HTTP errors, redirects, or missing expected content.
It does not sign in, submit applications, or call private endpoints. The JSON
is saved to `smileandhire-poc.local/results.json` (ignored by Git). It uses
the shared HTML parsers and is not part of scheduled sync; the production web
adapter has a separate hourly request budget and cache.

On October 5, 2026 the public page exposed 12 listings without login. One
matched the existing title filter: AI Implementation Specialist (Client Systems
Architect), through its Systems Architect title. AWS Architect and the other
listings did not match. The current filter is preserved. The default run only
saves JSON; `--import` writes eligible new jobs to the configured Supabase
project, skips existing jobs, and preserves all user tracking states. Jobs use
the `smileandhire` source (searchable as `Smile & Hire`) and no original posting
date is invented. If a database write response fails, the importer verifies
the rows with a read instead of repeating the write.
The site's linked Terms page and `/robots.txt` returned 404 during the check,
so no affirmative crawling permission could be verified.
