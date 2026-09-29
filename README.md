# Job Lead Tracker

A small, private React app for reviewing job leads stored in Supabase. Leads
are created by external sources; the UI reads them, keeps them synchronized,
and lets the user sort them by date or save them to a priority list.

## What is included

- Temporary no-login public priority mode for local development
- Owner-scoped Row Level Security
- Responsive lead cards with safe external links
- Newest-first and oldest-first date sorting
- Supabase-backed priority controls and a dedicated Priority tab
- Initial fetch, manual refresh, and Supabase Realtime refreshes
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

The migrations create the `job_leads` table, source metadata, timestamp
semantics, duplicate constraint, trigger, Realtime publication entry, grants,
and RLS policies. Migration `003` temporarily permits anonymous read, update,
and delete access so the local app does not require a login. Migration `004`
allows server-side imports to use a null owner in this public mode. Migration
`005` adds priority storage and removes browser delete access.

> **Warning:** public mode exposes every `job_leads` row and its priority
> setting to anyone who has the project URL and browser key. Do not deploy the
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

The sync can also read LinkedIn, Indeed, and OnlineJobs.ph job-alert messages
from Gmail over IMAP. It only reads recent messages, does not mark them as
read, and sends extracted listings through the same target-role and
remote-only filters as the public sources.

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

The production deployment includes a protected Vercel Function at
`/api/cron/sync-job-leads`. `vercel.json` invokes it at the start of every
hour. A run with one or more failed sources returns a failure response and
sends a notification email containing the cron title and source errors.

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
JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT=50
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

Each hourly run also revisits up to
`JOB_LINKEDIN_TIMESTAMP_BACKFILL_LIMIT` existing LinkedIn rows whose provider
time is empty. It stores only an exact timestamp or relative label returned by
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
