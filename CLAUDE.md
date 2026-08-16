# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build (also serves as type-check — no separate tsc command)
npm run lint     # ESLint
```

No test framework is configured.

## Project Overview

Sri Lankan microfinance loan management system ("DIRIYALANKA") built with **Next.js 16 App Router** + **Supabase** (PostgreSQL + Auth + Storage). Two roles: **admin** (desktop sidebar layout) and **staff** (mobile-first bottom-nav layout). Staff collect weekly loan payments in the field with GPS tracking.

### Loan Plans

| Plan   | New Member Balance | Returning Balance | Weekly Payment |
|--------|-------------------|-------------------|----------------|
| 5,000  | 6,000             | 6,000             | 600            |
| 10,000 | 13,000            | 12,500            | 1,000          |
| 20,000 | 26,000            | 25,000            | 2,000          |

Working days: Monday–Thursday only. Each center is assigned to exactly one staff member per day.

## Architecture

### Supabase Clients — CRITICAL

Three client factories in `src/lib/supabase/`:

- **`client.ts`** — Browser client (`createBrowserClient` from `@supabase/ssr`). Used in `'use client'` components.
- **`server.ts` → `createClient()`** — Server client with cookie-based auth. Used in Server Components and Server Actions.
- **`server.ts` → `createAdminClient()`** — Uses `createClient` from `@supabase/supabase-js` (NOT `createServerClient` from `@supabase/ssr`) with `SUPABASE_SERVICE_ROLE_KEY`. **This is the only way to bypass RLS.** Previous bug: using `createServerClient` with service_role key does NOT bypass RLS — mutations silently fail.

When a Server Action needs to both authenticate the user AND perform privileged writes (e.g., updating `loans` table), use `createClient()` for auth checks and dynamically import `createAdminClient` for the privileged operation. See `src/app/actions/payments.ts` for the pattern.

### Middleware

`src/proxy.ts` handles auth redirects (login/role-based routing). Despite the filename, it's the Next.js middleware — exported with `config.matcher`.

### Server Actions (`src/app/actions/`)

All mutations go through server actions with Zod validation. Key actions:
- `payments.ts` — Records payment, updates loan balance via adminClient, rolls back payment if balance update fails.
- `reports.ts` — Validates all center members have payment records before allowing daily report submission.
- `loans.ts` — Creates loans, auto-detects first-loan vs returning member for balance calculation.

### Date/Day Helpers

- `src/types/index.ts` → `TODAY_DAY_OF_WEEK()` — returns the live `Asia/Colombo` weekday (Mon–Thu), or `null` on Fri–Sun.
- `src/lib/utils.ts` → `getTodayString()` — returns today's date in `Asia/Colombo` as `YYYY-MM-DD`, independent of host TZ.

Both functions must stay in sync with the DB's `now() at time zone 'Asia/Colombo'` used by RLS — otherwise dawn/dusk collections get stamped with the wrong day.

### Alert System

**Staff center page** (`src/app/staff/centers/[id]/page.tsx`): 4-week lookback with net outstanding shortfall calculation. N/P adds full weekly to `netOwed`, partial payments add shortfall amount, overpayments reduce `netOwed`. Badge only shows if `netOwed > 0`. The `prevShortfall` amount is passed via URL params to the payment page.

**Admin members page** (`src/app/admin/members/page.tsx`): Uses most-recent-payment-per-loan approach (last 600 payments, no date filter). Critical = last 3 consecutive payments all N/P or shortfall.

### RLS Policies

Originally defined in `supabase/migrations/002_rls_policies.sql`, **but the live
databases have drifted from that file** (verified Aug 2026 — staging was aligned
to production's simpler policies to fix an infinite-recursion bug). Live state:
- Staff members-SELECT is **center-scoped only** (assigned centers, any day, no
  active-loan clause) — staff CAN find settled members, which the loan-renewal
  flow depends on
- Staff can only see **active** loans (not completed ones) — completed-today loans require adminClient to fetch
- Loan updates require admin role — hence `createAdminClient()` in payment action
- Check `pg_policies` on the live DB before trusting the 002 file

### Loan Rules (client requirements, Aug 2026)

- **One active loan per member.** Enforced inside the `record_loan` RPC
  (migration 029: SECURITY DEFINER with authorization, member row lock,
  structured SQLSTATEs P0301/P0302/P0303) plus a friendly pre-check in
  `createLoanAction`. The in-app Excel importer refuses to resurrect completed
  loans. Two legacy members hold >1 active loan (grandfathered until settled).
- **Loan refs are lettered:** `loanRef()` in [src/lib/loan-ref.ts](src/lib/loan-ref.ts)
  renders member number + Excel-style cycle letter (`DLG0005A` = 1st loan,
  `B` = 2nd…). cycle_no is allocated NULL-aware in `record_loan` and by the
  importer; a NULL cycle renders unlettered (never fabricate a letter).

### PDF Reports

`src/lib/pdf-report.ts` generates styled PDFs using jsPDF + jspdf-autotable. Three report types: daily collection (staff), members list, payments list.

### Excel Import

`src/app/admin/import/page.tsx` + `src/lib/excel-parser.ts` — Parses Excel files with flexible column matching and date parsing (handles Sri Lankan DD/MM/YYYY format, Excel serial dates, etc.). Auto-creates centers and members if they don't exist.

## Pending Credits

- Soma Wickramasinghe (MBR-017): LKR 600 credit
- Sumana Karunarathne (MBR-024): LKR 800 credit

These are overpayments from a historical balance fix. The reduction is now applied automatically inside `createLoanAction` in [src/app/actions/loans.ts](src/app/actions/loans.ts) the first time each member is issued a new loan via the app. After that loan is created the guard becomes a no-op for that member; once both have been consumed, remove the corresponding branch from `createLoanAction` and delete this section.
