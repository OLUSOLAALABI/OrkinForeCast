# Testing login and role-based access (RLS)

Use this to verify that **HQ Admin**, **Region Admin**, and **Branch User** see the correct data and menus.

---

## HQ Admin account (Olusola Alabi)

To sign in as HQ Admin with the designated account:

1. **Sign up in the app** (http://localhost:3000):
   - **Full Name:** Olusola Alabi  
   - **Email:** olusola.alabi@orkincanada.com  
   - **Password:** (use the password you chose for this HQ admin)  
   - **Region / Branch:** pick any (e.g. Ontario Region → any branch).  
   - Click **Create account**.
2. **Confirm email** if Supabase sends a confirmation link (check inbox or Supabase Auth → Users).
3. **In Supabase** go to **Table Editor** → **profiles**:
   - Find the row where **email** = `olusola.alabi@orkincanada.com`.
   - Set **role** = `hq_admin`.
   - Set **region_id** = (empty / null).
   - Set **branch_id** = (empty / null).
   - Save.
4. **Sign in** at http://localhost:3000 with that email and password. You should see the full HQ sidebar (Regions, Users, Branches, etc.).

---

## 1. Create three test users (optional)

1. **Start the app:** `pnpm dev` → open http://localhost:3000  
2. **Sign up three times** (use three different emails, e.g. `hq@test.com`, `region@test.com`, `branch@test.com`):
   - Click **Sign up**
   - Fill Full Name, Email, Password
   - Choose **Region** and **Branch** (any; we’ll change roles in Supabase)
   - Create account
3. **Confirm email** if Supabase requires it (check inbox or disable in Auth → Providers → Email).

---

## 2. Set roles in Supabase

1. In **Supabase** go to **Table Editor** → **profiles**.
2. Find the three users by email.

**User 1 – HQ Admin**

- Set **role** = `hq_admin`
- Set **region_id** = (empty / null)
- Set **branch_id** = (empty / null)
- Save

**User 2 – Region Admin**

- Set **role** = `region_admin`
- Set **region_id** = pick one region (e.g. copy the `id` of **ONTARIO REGION** from the **regions** table)
- Set **branch_id** = (empty / null)
- Save

**User 3 – Branch User**

- Leave **role** = `branch_user`
- Leave **region_id** and **branch_id** as set at sign-up (or set **branch_id** to one branch from **branches** table)
- Save

---

## 3. What to test when logged in

### HQ Admin (`hq@test.com`)

1. **Login** → should land on Dashboard.
2. **Sidebar** should show: Dashboard, Upload Data, Forecasts, **Branches**, **Regions**, Activity, **Users**.
3. **Regions** (sidebar → Regions):
   - Should list all 6 regions with totals.
   - No redirect; page loads.
4. **Branches** (sidebar → Branches):
   - Should list all branches (or filter by region if you use the filter).
5. **Users** (sidebar → Users):
   - Should list all profiles; can Edit role/region/branch.
6. **Forecasts** (sidebar → Forecasts):
   - Can pick any branch and generate.
7. **Activity** (sidebar → Activity):
   - Should show uploads from all branches.

**RLS:** HQ sees all regions, all branches, all users, all uploads/actuals/forecasts.

---

### Region Admin (`region@test.com`)

1. **Login** → Dashboard.
2. **Sidebar** should show: Dashboard, Upload Data, Forecasts, **Branches**, Activity.  
   - **No** “Regions” or “Users”.
3. **Regions** (if you open `/dashboard/regions` by URL):
   - Should **redirect** to `/dashboard` (only HQ can see Regions).
4. **Branches** (sidebar → Branches):
   - Should list **only branches in their region** (e.g. Ontario only).
   - UI should show something like “Your region: ONTARIO REGION”.
5. **Dashboard:**
   - Branch count and wording should be for **their region** only.
6. **Forecasts** (sidebar → Forecasts):
   - Branch dropdown should list **only branches in their region**.
7. **Activity** (sidebar → Activity):
   - Should show uploads **only for branches in their region**.

**RLS:** Region admin sees only their `region_id`’s branches and related data.

---

### Branch User (`branch@test.com`)

1. **Login** → Dashboard.
2. **Sidebar** should show: Dashboard, Upload Data, Forecasts, Activity.  
   - **No** “Branches” or “Regions” or “Users”.
3. **Branches** (if you open `/dashboard/branches` by URL):
   - Should **redirect** to `/dashboard` (branch users don’t get Branches list).
4. **Dashboard:**
   - Should show “Your branch only: [Branch Name]”.
   - Upload/forecast counts should be **only for their branch**.
5. **Forecasts** (sidebar → Forecasts):
   - Branch should be **fixed** to their branch (or only their branch in the list).
6. **Upload** (sidebar → Upload Data):
   - Branch should be **fixed** to their branch.
7. **Activity** (sidebar → Activity):
   - Should show uploads **only for their branch**.

**RLS:** Branch user sees only their `branch_id`’s data.

---

## 4. Quick checklist

| Check                         | HQ Admin | Region Admin | Branch User |
|------------------------------|----------|--------------|-------------|
| Sidebar: Regions             | ✓        | ✗            | ✗           |
| Sidebar: Users               | ✓        | ✗            | ✗           |
| Sidebar: Branches            | ✓        | ✓ (region)   | ✗           |
| /dashboard/regions           | OK       | Redirect     | Redirect    |
| Branches list scope          | All      | One region   | N/A         |
| Forecast/Upload branch scope | All      | Region       | One branch  |
| Activity scope               | All      | Region       | One branch  |

---

## 5. If something fails

- **403 / empty data:** RLS is working; check `profiles.role`, `region_id`, `branch_id` in Table Editor.
- **Redirect loop / wrong redirect:** Clear cookies for localhost and log in again.
- **Missing sidebar item:** Hard refresh (Ctrl+F5) after changing role in Supabase; then log out and log in again.
