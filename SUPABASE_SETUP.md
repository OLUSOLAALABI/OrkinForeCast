# Supabase setup for Orkin Forecasting

Follow these steps to connect the app to Supabase.

---

## 1. Create a Supabase project

1. Go to **[supabase.com](https://supabase.com)** and sign in (or create an account).
2. Click **New project**.
3. Choose an organization (or create one).
4. Set **Project name** (e.g. `orkin-forecasting`), **Database password** (save it somewhere safe), and **Region**.
5. Click **Create new project** and wait until the project is ready.

---

## 2. Get your API keys

1. In the Supabase dashboard, open your project.
2. Go to **Settings** (gear icon) → **API**.
3. Copy:
   - **Project URL** → use as `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys** → **anon public** → use as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Project API keys** → **service_role** (secret) → use as `SUPABASE_SERVICE_ROLE_KEY` if you want HQ to use **Invite user** (Dashboard → Users). Never expose this key to the client.

---

## 3. Add keys to your app

1. In the project root, copy the example env file:
   ```bash
   copy .env.example .env
   ```
   (Or create `.env` if it doesn’t exist.)

2. Open `.env` and set:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_KEY
   ```
   Use the **Project URL** and **anon public** key from step 2.

3. **Invite user (optional):** to let HQ send email invites from Dashboard → Users, set `SUPABASE_SERVICE_ROLE_KEY` in `.env` (same Supabase project → Settings → API → service_role). Keep this key server-only.

4. **Production only:** set your hosted app URL so auth redirects (email confirm, password reset, invite) work:
   ```env
   NEXT_PUBLIC_APP_URL=https://yourdomain.com
   ```
   (No protocol suffix like `/auth/callback` – just the origin, e.g. `https://app.orkin.com`.)  
   For local dev you can leave this unset; the app uses `window.location.origin`.

5. Restart the dev server so the new env vars load.

---

## 4. Run the database schema

1. In Supabase, go to **SQL Editor**.
2. Click **New query**.
3. Open `scripts/001_create_schema.sql` in your editor, copy **all** of its contents, and paste into the SQL Editor.
4. Click **Run** (or press Ctrl+Enter).
5. Confirm you see “Success. No rows returned” (or similar). This creates:
   - Tables: `regions`, `branches`, `profiles`, `uploads`, `actuals`, `forecasts`
   - RLS policies and helper functions
   - Trigger to create a profile when a user signs up
   - Seed data: 6 regions and **49 operational branches** (functional/corporate OH, CC, QA, SALES, TTL are excluded).

6. **If the sign-up page shows "No branches in this region"** after selecting a region, run the migration `scripts/002_branches_select_anon.sql` in the SQL Editor. It allows the sign-up form (unauthenticated) to load the branch list.

7. **If you previously ran the old schema with 77 branches** and want to keep only the 49 operational branches, run `scripts/003_operational_branches_only.sql` in the SQL Editor. This removes the other branches and their actuals/forecasts/uploads; users with a removed branch will have their `branch_id` cleared.

---

## 5. Configure Auth redirect (email confirmation & password reset)

1. In Supabase, go to **Authentication** → **URL Configuration**.
2. Under **Redirect URLs**, add **all** URLs where your app runs:
   - **Local dev:**  
     `http://localhost:3000/auth/callback`  
     `http://localhost:3000/dashboard`  
     `http://localhost:3000/auth/reset-password`
   - **Production:** use the same paths with your `NEXT_PUBLIC_APP_URL` domain, e.g.:  
     `https://yourdomain.com/auth/callback`  
     `https://yourdomain.com/dashboard`  
     `https://yourdomain.com/auth/reset-password`
3. Save.

---

## 6. Confirmation email (sign-up)

If users say they **didn’t receive the confirmation email**:

1. **Check spam/junk** – Supabase sends from a shared domain; messages often land in spam.
2. **Resend** – On the “Check your email” page, the email is pre-filled; they can click **Resend** to send the link again.
3. **Disable “Confirm email” (optional)** – In Supabase go to **Authentication** → **Providers** → **Email**. Turn off **“Confirm email”** so new users can sign in without clicking a link. Use this for internal/testing; for production you may want to keep confirmation on and use custom SMTP (Supabase → Project Settings → Auth → SMTP) so emails come from your domain and are less likely to be filtered.

---

## 7. How sign-up and roles work

| Role | How they get an account | Who can create |
|------|-------------------------|----------------|
| **Branch User** | Self sign-up at **Sign up** (must choose Region + Branch), or invited by HQ via **Dashboard → Users → Invite user**. | Anyone; public sign-up is only for Branch Users. |
| **Region Admin** | Created by an HQ Admin: **Invite user** then **Edit** to set role/region, or change role in **Dashboard → Users** (edit) or in Supabase **Table Editor → profiles**. | HQ Admin only. |
| **HQ Admin** | Created by an existing HQ Admin: set `role` to `hq_admin` in Supabase **Table Editor → profiles** (or via SQL). There is no self-sign-up for HQ. | First one: manually in Supabase. Others: existing HQ Admin. |

- **Public sign-up** = Branch User only (region + branch required).
- **Invite user** (Dashboard → Users) = HQ can send an email invite; the user gets a magic link. After they sign in, HQ can **Edit** their profile to set role, region, and branch. Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- **Region Admin / HQ Admin** = Ask an admin to assign the role, or set it in Supabase **profiles** (role, and for Region Admin: region_id).

---

## 8. Create your first HQ admin

New sign-ups are Branch Users. To get your first HQ admin:

**Option A – After first sign-up (recommended)**

1. Sign up once in the app (any role/region/branch).
2. In Supabase, go to **Table Editor** → **profiles**.
3. Find your user row and set **role** to `hq_admin`.
4. Sign out and sign in again in the app; you’ll have full access.

**Option B – Via SQL**

1. Sign up once in the app.
2. In Supabase **SQL Editor**, run (replace with your email):
   ```sql
   UPDATE public.profiles
   SET role = 'hq_admin'
   WHERE email = 'your-email@example.com';
   ```

---

## 9. Verify

1. Run the app: `pnpm dev`
2. Open **http://localhost:3000**
3. Click **Get Started** or **Sign in** and create an account or sign in.
4. After making your user `hq_admin` (step 7), you should see the full dashboard (Regions, Users, etc.).

If anything fails, check the browser console and Supabase **Authentication** → **Users** and **Table Editor** → **profiles** to confirm the user and profile exist.
