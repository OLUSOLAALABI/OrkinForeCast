# Orkin – Branch Forecasting

Monthly forecasting app for **49 operational branches** across 6 regions, with role-based access: **HQ Admin**, **Region Admin**, and **Branch User**. Upload Excel actuals and budget, generate forecasts per branch, and drill down by region.

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript**
- **Supabase** (Auth, Postgres, RLS)
- **Tailwind CSS**, **shadcn/ui**, **Recharts**

## Quick start

1. **Clone and install**
   ```bash
   pnpm install
   ```
   After adding or changing dependencies in `package.json`, run `pnpm install` again and commit `pnpm-lock.yaml` so Vercel (and CI) can install with a frozen lockfile.

2. **Environment**
   - Copy `.env.example` to `.env`
   - Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from [Supabase](https://supabase.com/dashboard) → your project → Settings → API
   - For production, set `NEXT_PUBLIC_APP_URL` (e.g. `https://yourdomain.com`)

3. **Database**
   - In Supabase: SQL Editor → run the full contents of `scripts/001_create_schema.sql`
   - See **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** for step-by-step setup (auth redirect URLs, first HQ admin, etc.)

4. **Run**
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command      | Description                |
|-------------|----------------------------|
| `pnpm dev`  | Start dev server           |
| `pnpm build`| Production build           |
| `pnpm start`| Start production server    |
| `pnpm lint` | Run ESLint                 |
| `pnpm test` | Run unit tests (Vitest)     |

**Bulk import from Excel:** If you have `scripts/data/three-years.xlsm` (one sheet per branch, Description + Jan–Dec), run `node scripts/import-actuals.mjs --inspect` then `node scripts/import-actuals.mjs`. See **scripts/data/README.md**.

## Excel upload format

- **Column A** = line item (Description)
- **Columns B–M** = Jan–Dec (numeric values)
- **Row 1** = header (skipped)

Use **Upload Data** → **Download template** in the app, or see **[UPLOAD_FORMAT.md](./UPLOAD_FORMAT.md)**.

## Forecasting and dates

- Forecasts use **last year actuals**, **current year actuals to date**, and **budget** (when uploaded).
- **Current month** and **forecast year** can be set on the Forecast page; underlying logic uses the selected year/month for “as of” and remaining months.
- Server date is **UTC** for “current month” when not overridden.

## Docs

- **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** – Supabase project, schema, auth redirects, roles
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** – Deploy to Vercel (env vars + Supabase redirect URLs)
- **[UPLOAD_FORMAT.md](./UPLOAD_FORMAT.md)** – Excel layout and tips for accurate forecasting
- **[TESTING_ROLES.md](./TESTING_ROLES.md)** – Test login and RLS for HQ Admin, Region Admin, Branch User

## License

Private.
