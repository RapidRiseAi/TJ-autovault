# autovault (TJ pilot)

Production-ready foundation for a **multi-tenant mechanic customer portal + workshop portal**.

## Stack
- Next.js App Router + TypeScript
- TailwindCSS + shadcn-style UI primitives
- Supabase (Auth + Postgres + Storage)
- Resend transactional email

## Project structure

```text
app/
  (auth)/login
  (customer)/dashboard
  (customer)/vehicles/[id]
  (customer)/vehicles/new
  (customer)/reports/new
  (workshop)/workshop/dashboard
  (workshop)/jobs/[id]
  api/
components/
lib/
  config/
  supabase/
  email/
supabase/
  migrations/
  seed/
tests/
```

## Core implementation notes
- Multi-tenant data model keyed by `workshop_account_id`.
- Append-only critical entities with DB-level update/delete blockers.
- RLS policies on all core tables.
- Brand settings support white-label and configurable watermark.
- Customer/workshop route groups and auth middleware.
- Service-role only server API routes for signing uploads and admin email flows.

## Local setup
1. Install dependencies
   ```bash
   npm install
   ```
2. Copy env file
   ```bash
   cp .env.example .env.local
   ```
3. Configure Supabase project and env values.
4. Apply SQL migration in Supabase SQL editor:
   - `supabase/migrations/202602150001_init.sql`
5. Seed demo data:
   ```bash
   npm run db:seed
   ```
6. Run dev server:
   ```bash
   npm run dev
   ```

## Checks
```bash
npm run lint
npm run typecheck
npm run test
```

## Deployment (Vercel)
1. Import GitHub repo into Vercel.
2. Set all `.env.example` values in Vercel project env.
3. Ensure Supabase redirect URLs include deployed domain.
4. Deploy.

## CI: automatic Supabase migrations
Migrations are applied automatically on every push to the `main` branch via GitHub Actions (`.github/workflows/supabase-migrations.yml`).

### 1) Find `SUPABASE_DB_URL` in Supabase
1. Open your Supabase project dashboard.
2. Go to **Project Settings** → **Database**.
3. Copy the **Connection string** for direct Postgres access (URI format like `postgresql://...`).
4. Use that full URI as `SUPABASE_DB_URL`.

### 2) Add `SUPABASE_DB_URL` as a GitHub Actions secret
1. Open your GitHub repository.
2. Go to **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret**.
4. Set:
   - **Name:** `SUPABASE_DB_URL`
   - **Secret:** paste the Postgres connection string from Supabase.

### 3) How it works
- Triggered on:
  - pushes to `main`
  - manual runs via **workflow_dispatch**
- The workflow installs the Supabase CLI and runs:
  - `supabase db push --db-url $SUPABASE_DB_URL`
- If `SUPABASE_DB_URL` is missing, the job fails with a clear error before running migrations.

## Supabase manual dashboard setup
1. **Auth settings**
   - Enable Email provider.
   - Enable email OTP / magic link.
   - Set Site URL + redirect URL(s):
     - `http://localhost:3000/login`
     - `https://<your-domain>/login`
2. **Storage buckets**
   - Create private bucket: `private-documents`
   - Create private bucket: `private-images`
3. **Users**
   - Create initial admin user in Auth.
   - Update `supabase/seed/seed.sql` admin UUID before seeding.

## Reset Supabase to only the admin user
If you want to clear test data and keep only the admin account (`team@rapidriseai.com`):

1. Open **Supabase → SQL Editor**.
2. Run `supabase/seed/reset_to_admin_only.sql`.

The reset script removes all vehicle/customer/workshop activity data and deletes
all storage objects, while preserving only the admin auth user and their linked
profile/workshop records.

## Config editing
Main app/business limits live in:
- `lib/config/app-config.ts`

Edit:
- upload limits and MIME types
- customer tiers
- workshop plans
- watermark defaults
- email sender
