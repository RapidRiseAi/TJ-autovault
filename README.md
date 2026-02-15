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
  (customer)/reports/new
  (workshop)/dashboard
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

## Config editing
Main app/business limits live in:
- `lib/config/app-config.ts`

Edit:
- upload limits and MIME types
- customer tiers
- workshop plans
- watermark defaults
- email sender
