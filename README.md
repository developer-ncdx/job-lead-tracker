# Job Lead Tracker

A small, private React app for reviewing job leads stored in Supabase. Leads
are created by external sources; the UI reads them, keeps them synchronized,
and lets the user edit or delete them.

## What is included

- Temporary no-login public CRUD mode for local development
- Owner-scoped Row Level Security
- Responsive lead cards with safe external links
- Edit and delete flows with validation and confirmation
- Initial fetch, manual refresh, and Supabase Realtime refreshes
- Server-side Greenhouse, Ashby, Lever, We Work Remotely, Remotive, Remote OK,
  Jobicy, Himalayas, and optional Jooble ingestion
- Global software-development role filtering and duplicate prevention
- Source-aware Published, Created, Updated, and First seen timestamps
- Loading, empty, stale-data, configuration, and mutation error states
- React, TypeScript, Vite, Tailwind CSS, and shadcn components

## Prerequisites

- Node.js 20.19 or newer
- A Supabase project
- An optional [Jooble API key](https://jooble.org/api/about) for broad global
  search; the other configured sources do not need keys

## 1. Create the database table

Open the Supabase SQL Editor and run these files in order:

1. `supabase/migrations/001_create_job_leads.sql`
2. `supabase/migrations/002_job_source_metadata.sql`
3. `supabase/migrations/003_temporary_public_crud.sql`
4. `supabase/migrations/004_public_imports_without_auth.sql`

The migrations create the `job_leads` table, source metadata, timestamp
semantics, duplicate constraint, trigger, Realtime publication entry, grants,
and RLS policies. Migration `003` temporarily permits anonymous read, update,
and delete access so the local app does not require a login. Migration `004`
allows server-side imports to use a null owner in this public mode.

> **Warning:** public CRUD mode exposes every `job_leads` row to anyone who has
> the project URL and browser key. Do not deploy the app publicly while
> migration `003` is active. Inserts remain server-only.

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
```

The anon/publishable key is designed for browser use and is protected by RLS.
The service-role key is only for the Node sync process. Never put a Supabase
`service_role`, Jooble key, or any other secret in a `VITE_` variable.

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
discovery. Jooble adds another global search when `JOOBLE_API_KEY` is present.

The default role filter accepts AI, ML, LLM, Bubble.io, software, web,
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
IDs and URLs, preserves user-edited title/description/URL values, and upserts
source metadata. API timestamps retain their meaning:

- Greenhouse and Ashby: `Published`
- Lever: `Created`
- We Work Remotely, Remotive, Remote OK, Jobicy, and Himalayas: `Published`
- Jooble: `Updated`
- Missing source timestamp: `First seen`

For a local recurring process:

```bash
npm run jobs:watch
```

The default interval is ten minutes. Override it with
`JOB_SYNC_INTERVAL_MINUTES`. The watcher only runs while the computer/process
is active; use a server scheduler or hosted cron for an always-on deployment.

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

**Edits or deletes are denied**

Apply all three migrations and verify the browser is using the anon or
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
