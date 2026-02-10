# Deploy to Vercel

Use this checklist when hosting the app on Vercel so auth (login, sign-up, password reset, invite) works with Supabase.

---

## 1. Add env vars in Vercel

1. In **Vercel**: open your project → **Settings** → **Environment Variables**.
2. Add these (same values as in your local `.env`):

| Name | Value | Notes |
|------|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` | From Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | From Supabase → Settings → API → anon public |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Your **production** Vercel URL (no trailing slash). **Required.** Confirmation and reset emails will redirect here. Do **not** use `http://localhost:3000` here or links in emails will point to localhost and fail on phones. |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Optional. Only if you use **Invite user** on the dashboard. From Supabase → Settings → API → service_role |

3. Apply to **Production** (and Preview if you want). Save.
4. **Redeploy** after changing env vars (Deployments → ⋮ → Redeploy).  
5. If confirmation emails were opening `localhost` or showed "link invalid or expired", set `NEXT_PUBLIC_APP_URL` to your live URL, redeploy, then have users **sign up again from the live site** (or use Resend to get a new link).

---

## 2. Add your Vercel URL in Supabase

1. In **Supabase**: go to **Authentication** → **URL Configuration**.
2. **Site URL** (optional but recommended): set to your Vercel URL, e.g.  
   `https://your-app.vercel.app`
3. **Redirect URLs**: add these (replace `your-app.vercel.app` with your real Vercel domain):

   ```
   https://your-app.vercel.app/auth/callback
   https://your-app.vercel.app/dashboard
   https://your-app.vercel.app/auth/reset-password
   ```

   Keep your localhost URLs if you still use local dev:

   ```
   http://localhost:3000/auth/callback
   http://localhost:3000/dashboard
   http://localhost:3000/auth/reset-password
   ```

4. Save.

---

## 3. Push and deploy

1. Push your code to GitHub (and connect the repo to Vercel if you haven’t).
2. Vercel will build and deploy. After deploy, open `https://your-app.vercel.app`.
3. Test: **Sign in** and **Sign up**; confirm redirects back to the app and no auth errors.

---

## Quick checklist

- [ ] Vercel env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`
- [ ] Vercel env (optional): `SUPABASE_SERVICE_ROLE_KEY` if you use Invite user
- [ ] Supabase Auth → URL Configuration: **Redirect URLs** include `https://your-app.vercel.app/auth/callback`, `/dashboard`, `/auth/reset-password`
- [ ] Supabase Auth → URL Configuration: **Site URL** = `https://your-app.vercel.app` (recommended)
- [ ] Redeploy on Vercel after changing env vars
