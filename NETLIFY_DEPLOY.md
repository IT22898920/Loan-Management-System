# Netlify Deployment Guide - DIRIYALANKA Loan Management System

This guide walks you through deploying the DIRIYALANKA microfinance loan management system to Netlify with a custom domain (`diriyalanka.lk`).

> **Sinhala Note:** මෙය production deployment guide එක. හැම step එකම පිළිවෙලට කරන්න. Environment variables වැරදුණොත් app එක load වෙන්නේ නෑ. SUPABASE_SERVICE_ROLE_KEY එක **කවදාවත්** frontend code එකේ expose කරන්න එපා.

---

## 1. Prerequisites

Before starting, make sure you have:

- [ ] **GitHub repository** with the latest code pushed to `main` branch
  - Verify locally: `git status` shows clean working tree
  - Verify remote: `git push origin main` succeeds
- [ ] **Netlify account** (free tier is sufficient to start)
  - Sign up at https://app.netlify.com/signup
  - Recommended: sign up with the same GitHub account for easier integration
- [ ] **Supabase project** already provisioned with all migrations applied
  - URL, anon key, and service role key copied to a secure location
- [ ] **Domain registrar access** for `diriyalanka.lk` (register.lk account credentials)
- [ ] **Local build passes**: `npm run build` completes without errors

> **Sinhala Note:** Build එක local එකේ fail වෙනවා නම් Netlify එකේත් fail වෙනවා. ඉස්සෙල්ලා `npm run build` දාලා බලන්න.

---

## 2. Environment Variables

In the Netlify dashboard, navigate to: **Site settings → Environment variables → Add a variable**

Add the following three variables:

### 2.1 `NEXT_PUBLIC_SUPABASE_URL`
- **Scope:** All scopes (Builds, Functions, Runtime, Post processing)
- **Value:** Your Supabase project URL (e.g., `https://xxxxxxxxxxxx.supabase.co`)
- **Secret:** No (this is a public URL)

### 2.2 `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Scope:** All scopes
- **Value:** Supabase anon/public key (from Supabase dashboard → Project Settings → API)
- **Secret:** No (anon key is safe to expose to the browser; RLS policies protect data)

### 2.3 `SUPABASE_SERVICE_ROLE_KEY` (SECRET - server-only)
- **Scope:** **Builds and Functions ONLY** — do NOT expose to client runtime
- **Value:** Supabase service role key (from Supabase dashboard → Project Settings → API)
- **Secret:** **YES** — mark as "Contains secret values"
- **Critical:** This key **bypasses Row Level Security**. Leaking it gives full database access.

> **Sinhala Note:** `SUPABASE_SERVICE_ROLE_KEY` එක `NEXT_PUBLIC_` prefix එකෙන් **කවදාවත්** පටන් ගන්න එපා. ඒක browser එකට යනවා. මේක server-side actions වලට විතරයි (`src/lib/supabase/server.ts` → `createAdminClient()`).

### Verification checklist
- [ ] All three variables saved
- [ ] `SUPABASE_SERVICE_ROLE_KEY` marked as secret
- [ ] No variable names have typos (case-sensitive)
- [ ] No trailing spaces in values

---

## 3. Connect GitHub Repository to Netlify

1. From the Netlify dashboard, click **Add new site → Import an existing project**.
2. Choose **Deploy with GitHub** (authorize Netlify if first-time).
3. Select the GitHub organization/account that owns the repository.
4. Search for the repository (e.g., `Loan-Management-System`) and click it.
5. On the **Site configuration** screen:
   - **Branch to deploy:** `main`
   - **Base directory:** *(leave empty - repo root)*
   - **Build command:** *(auto-detected from `netlify.toml`)*
   - **Publish directory:** *(auto-detected from `netlify.toml`)*
6. Click **Deploy site**.

> **Sinhala Note:** First deploy එක ~3-5 minutes ගන්නවා. Build logs බලන් ඉන්න. Error එකක් ආවොත් `Site overview → Deploys → [latest deploy] → Deploy log` එකේ බලන්න.

---

## 4. Build Settings (Auto-Detected by netlify.toml)

The repository includes a `netlify.toml` at the root which Netlify reads automatically. You should NOT need to edit build settings in the UI.

Expected auto-detected configuration:
- **Build command:** `npm run build`
- **Publish directory:** `.next`
- **Node version:** Set via `netlify.toml` (matches local `package.json` engines)
- **Next.js plugin:** `@netlify/plugin-nextjs` (handles SSR, server actions, and middleware routing)

### If build fails
- Check the deploy log for the failing step
- Common issues:
  - Missing environment variable → app builds but fails at runtime
  - Type errors → `npm run build` enforces TypeScript checks
  - Node version mismatch → ensure `netlify.toml` specifies Node 18+ or 20+

> **Sinhala Note:** `npm run build` එක TypeScript check එකත් වෙනවා (no separate `tsc`). Type error එකක් තියෙනවා නම් build fail වෙනවා.

---

## 5. Custom Domain Setup (`diriyalanka.lk`)

### 5.1 Add Custom Domain in Netlify

1. Go to **Site settings → Domain management → Add a domain**.
2. Enter `diriyalanka.lk` and click **Verify**.
3. Confirm you own the domain when prompted.
4. Netlify will also offer to add `www.diriyalanka.lk` — accept this (redirects to apex).
5. Note the Netlify-provided values:
   - **Apex (A record) target:** `75.2.60.5` (Netlify's load balancer IP — verify current value in Netlify UI)
   - **www (CNAME) target:** `<your-site-name>.netlify.app`

### 5.2 Add DNS Records at register.lk

Log in to https://www.register.lk → **My Domains → diriyalanka.lk → DNS Management**.

Add the following records:

| Type  | Host / Name | Value                                   | TTL   |
|-------|-------------|-----------------------------------------|-------|
| A     | `@`         | `75.2.60.5` (Netlify IP — confirm in UI)| 3600  |
| CNAME | `www`       | `<your-site-name>.netlify.app`          | 3600  |

> **Sinhala Note:** register.lk DNS panel එක සමහර වෙලාවට slow. Records දාලා **Save** කරන්න. Existing A/CNAME records (default parking page) තියෙනවා නම් delete කරන්න — නැත්නම් conflict.

### 5.3 Wait for DNS Propagation

- DNS propagation: **15 minutes to 24 hours** (usually ~30 min for `.lk`)
- Check status: https://dnschecker.org → enter `diriyalanka.lk` → select `A` record
- Once propagated globally, Netlify will detect it and proceed to SSL.

### 5.4 SSL Certificate Provisioning

- Netlify auto-provisions a **Let's Encrypt SSL certificate** once DNS resolves.
- This usually takes **5-15 minutes** after DNS is verified.
- Status visible at: **Domain management → HTTPS**
- When complete, you'll see "Your site has HTTPS enabled" with a green checkmark.

### 5.5 Set Primary Domain

1. Under **Domain management**, find `diriyalanka.lk` in the list.
2. Click the menu (`⋯`) → **Set as primary domain**.
3. Netlify will redirect `www.diriyalanka.lk` and the `*.netlify.app` URL to the primary.

> **Sinhala Note:** Primary domain set කරන්න කලින් SSL provision වෙන්න ඉන්න. නැත්නම් "Mixed content" errors එනවා.

---

## 6. Update Supabase Auth URL Allowlist

Supabase Auth blocks redirects to URLs not on the allowlist. After deploy, update both the temporary Netlify URL and your custom domain.

1. Open Supabase Dashboard → your project → **Authentication → URL Configuration**.
2. Update **Site URL** to: `https://diriyalanka.lk`
3. Under **Redirect URLs**, add ALL of the following (one per line):
   ```
   https://diriyalanka.lk
   https://diriyalanka.lk/**
   https://www.diriyalanka.lk
   https://www.diriyalanka.lk/**
   https://<your-site-name>.netlify.app
   https://<your-site-name>.netlify.app/**
   http://localhost:3000
   http://localhost:3000/**
   ```
4. Click **Save**.

> **Sinhala Note:** `localhost` entries එවත් තියාගන්න — local dev කරද්දී ඕන වෙනවා. `**` wildcard එක auth callback paths වලට හරිම වැදගත්.

---

## 7. Post-Deploy Smoke Tests Checklist

After deploy succeeds and DNS/SSL are ready, verify the live site:

### 7.1 Basic accessibility
- [ ] `https://diriyalanka.lk` loads with green padlock (valid SSL)
- [ ] `https://www.diriyalanka.lk` redirects to apex
- [ ] No mixed-content warnings in browser DevTools console

### 7.2 Authentication flows
- [ ] Login page renders (`/login`)
- [ ] Admin login works → redirects to `/admin` dashboard
- [ ] Staff login works → redirects to `/staff` mobile layout
- [ ] Logout clears session and redirects to login
- [ ] Wrong credentials show error message (not server crash)

### 7.3 Admin role (desktop)
- [ ] Sidebar nav renders
- [ ] Members list loads with data (`/admin/members`)
- [ ] Centers list loads (`/admin/centers`)
- [ ] Loans list loads (`/admin/loans`)
- [ ] Payments list loads (`/admin/payments`)
- [ ] PDF report download works (members or payments)
- [ ] Excel import page loads (`/admin/import`)

### 7.4 Staff role (mobile)
- [ ] Bottom nav renders on mobile viewport
- [ ] Today's assigned centers appear on `/staff`
- [ ] Center detail page loads members (`/staff/centers/[id]`)
- [ ] **GPS permission prompt appears** when opening center
- [ ] Payment form opens (`/staff/payment/new`)
- [ ] Payment submission succeeds and updates loan balance
- [ ] Daily report submission blocks if not all members paid

### 7.5 Server actions / mutations
- [ ] Create a test payment → verify `payments` table has new row
- [ ] Verify `loans.loan_balance` decremented correctly
- [ ] Force a payment rollback scenario (if possible) → no orphaned rows

### 7.6 Performance / monitoring
- [ ] First page load < 3 seconds on 4G
- [ ] Lighthouse score: Performance > 80, Accessibility > 90
- [ ] No errors in Netlify **Functions → Logs**
- [ ] No errors in browser console on key pages

### 7.7 Security verification
- [ ] `SUPABASE_SERVICE_ROLE_KEY` NOT visible in page source (View Source → Ctrl+F search)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` NOT in browser DevTools → Network → any JS bundle
- [ ] RLS active: staff cannot access other staff's centers via direct URL manipulation
- [ ] Logged-out users redirected from protected routes

### 7.8 Date/Day override removal (CRITICAL before production)
- [ ] `src/types/index.ts` → `TODAY_DAY_OF_WEEK()` returns real day (not hardcoded `'monday'`)
- [ ] `src/lib/utils.ts` → `getTodayString()` returns real date (not hardcoded `'2026-04-13'`)
- [ ] Redeploy after removing overrides

> **Sinhala Note:** TEST MODE overrides දෙක production එකට යන්න කලින් **අනිවාර්යයෙන්** ඉවත් කරන්න. නැත්නම් staff දන්නේ වැරදි දවසේ centers. CLAUDE.md එකේ specifically warning එකක් තියෙනවා.

---

## Rollback Procedure

If a deploy breaks production:

1. Netlify dashboard → **Deploys** tab
2. Find the last known-good deploy
3. Click the menu (`⋯`) → **Publish deploy**
4. Site reverts immediately (no rebuild needed)
5. Investigate the broken commit locally before redeploying

---

## Continuous Deployment

Once connected, every push to `main` triggers an auto-deploy:
- Pull requests get **deploy previews** at unique URLs
- Failed deploys do NOT replace the live site (atomic deploys)
- Build notifications can be sent to email/Slack (Site settings → Build & deploy → Deploy notifications)

> **Sinhala Note:** Direct main එකට push කරන්න කලින් PR හදලා deploy preview එකේ test කරන එක safe. Production app එක client ලාට වැදගත් — break වෙන්න දෙන්න එපා.

---

## Support Contacts

- **Netlify Status:** https://www.netlifystatus.com
- **Supabase Status:** https://status.supabase.com
- **register.lk Support:** support@register.lk
- **Project repo:** (your GitHub URL)

---

**Last updated:** 2026-06-19
**Maintained by:** NextGen Web Solutions
