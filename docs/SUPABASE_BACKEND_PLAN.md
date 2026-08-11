# Supabase backend implementation plan

Status: local CLI initialized; remote link blocked by Supabase project permissions.

Target hosted project: `kkedepbyrarsewofmoao`

Demo owner: existing Supabase Auth user `kevin@webaanzee.be`

## Non-negotiable outcomes

1. Supabase Auth is the only email/password identity provider. The app never stores or verifies account passwords itself.
2. Every business row belongs to exactly one store. PostgreSQL row-level security (RLS) prevents cross-store reads and writes, even if the browser is tampered with.
3. Kevin's existing Auth user owns the demo store and receives the current demo catalog, transactions, customers, gift cards, settings, reports, and other fixture content exactly once.
4. Every other newly registered account receives a new store, an owner membership, and no business/demo rows. Empty means no sample products, customers, transactions, gift cards, reports, orders, or prefilled demo merchant/webshop content.
5. Logging out and logging into another account on the same browser cannot expose the previous account's IndexedDB or localStorage data.
6. Financial operations are atomic and idempotent. A retry cannot create a second sale, stock mutation, gift-card event, refund, or webshop order.
7. The browser receives only the Supabase URL and publishable/anon key. The database password and service-role key never enter source control, Vite variables, browser storage, or frontend bundles.

## Current repository findings

The app is currently offline-only and uses Dexie/IndexedDB for 16 tables: transactions, daily reports, audit entries, users, outbox entries, shifts, voids, products, categories, customers, gift cards, gift-card events, business actions, purchase orders, stock movements, and webshop orders.

Authentication is currently custom. Account password and PIN hashes are stored in IndexedDB. `ensureDemoAccount()` runs on every app bootstrap, even outside fixture mode. Signing in as Kevin invokes `seedDemoRetailData()` in the browser.

Data is not tenant-scoped. The single IndexedDB database is named `PwaymentRetailPOS`, and persisted Zustand/localStorage keys are shared by every login on that browser.

Demo leakage paths that must be removed or tenant-gated:

- `ensureDemoAccount()` always inserts the Kevin demo identity locally.
- `VITE_SEED_RETAIL_CATALOG` defaults to true, so an empty products table is filled with the static catalog.
- Kevin login calls the local demo transaction/customer/gift-card generator.
- merchant profile defaults contain example/demo business data.
- webshop defaults contain a complete skate shop, featured products, coupons, domains, contact details, images, and shipping/payment configuration.
- cart, merchant, webshop, integrations, theme, insight workflow, and storefront cart persistence are global browser keys rather than store-scoped keys.
- switching Auth users does not close/switch/clear the shared IndexedDB cache.

These are release blockers for account isolation even if the remote database has perfect RLS.

## Phase 0 — gain safe remote access and establish a baseline

1. Authenticate the CLI with a Supabase account that can access `kkedepbyrarsewofmoao`.
2. Link with `npx supabase link --project-ref kkedepbyrarsewofmoao`; enter the database password through the hidden prompt or `SUPABASE_DB_PASSWORD`, never a committed file.
3. Run read-only inventory before any remote write:
   - `npx supabase projects list`
   - `npx supabase migration list --linked`
   - `npx supabase db pull --linked`
   - inspect schemas, extensions, functions, triggers, policies, grants, storage buckets, and existing migration history
   - resolve `kevin@webaanzee.be` to exactly one `auth.users.id`
4. Back up the remote database schema and data before the first push. Preserve all unknown existing objects by default.
5. Match `supabase/config.toml` to the remote PostgreSQL major version and Auth configuration.
6. Generate a baseline migration from the remote. Never assume the hosted project is empty.

Exit criteria: the local migrations reproduce the current remote schema, and no proposed Pwayment migration has been applied remotely.

## Phase 1 — identity, stores, and memberships

Create the following core model using UUID primary keys and UTC `timestamptz` values:

### `profiles`

- `id uuid primary key references auth.users(id) on delete cascade`
- first name, last name, display name, optional phone
- created/updated timestamps
- no password hash and no authorization role

### `stores`

- `id uuid primary key`
- name, legal identity/contact/receipt fields
- locale `nl-BE`, currency `EUR`, timezone `Europe/Brussels`
- plan/status fields only if genuinely enforced
- created/updated timestamps

### `store_memberships`

- `store_id` + `user_id` composite unique key
- role constrained to `owner`, `manager`, or `cashier`
- active/invited status and created/updated timestamps
- authorization role lives here, not in user-editable Auth metadata

### Auth onboarding

- Frontend registration calls `supabase.auth.signUp()` with email/password and non-authoritative profile/store-name metadata.
- A tightly scoped `security definer` trigger/function creates the profile, one empty store, and one owner membership for a brand-new standalone signup.
- The function fixes `search_path`, validates inputs, is idempotent, and grants no arbitrary store/role selection.
- Email invitations for staff attach a user to an existing store through a server-side/admin flow; they must not create a second store.
- The login form calls `signInWithPassword()` and genericizes errors to avoid account enumeration.
- Logout calls Supabase Auth, clears in-memory state, closes the tenant cache, and removes tenant-local sensitive state.
- Password reset, email confirmation, session refresh, and auth-state listeners are implemented before deleting custom auth.

### Staff PIN decision

Supabase Auth does not natively authenticate a six-digit POS PIN. Recommended design:

- every human staff member has a Supabase Auth identity and store membership;
- a PIN is only a short device-unlock/approval factor inside an already authenticated store session;
- PIN hashes never appear in browser-readable tables;
- verification happens in a rate-limited Edge Function or narrowly scoped RPC using a strong password hash and audit trail;
- manager approval checks active membership and role server-side;
- a PIN never creates a Supabase session or replaces the staff member's primary login.

If the business instead wants shared cashier identities without email accounts, that must be explicitly accepted as a weaker identity/audit model before implementation.

## Phase 2 — tenant-safe database schema

Every table below includes a non-null `store_id` foreign key. Child rows also use composite constraints or trigger checks so a child cannot reference a parent from another store.

### Catalog and inventory

- `categories`: name, VAT rate, sort order, active flag; unique name/slug per store as required
- `products`: category, SKU/barcode, price/cost cents, VAT rate snapshot source, brand/supplier/variant, stock thresholds, product type, active flag
- `stock_movements`: append-only quantity delta ledger referencing product and optional sale/purchase order
- optional `product_images` in Supabase Storage with per-store object paths and policies

Use integer/bigint cents, nonnegative checks where applicable, explicit quantity constraints, and unique `(store_id, sku)` / `(store_id, barcode)` only when non-null.

### Customers and gift cards

- `customers`: contact/profile fields, active flag, timestamps; derived spend/visit values should be computed or transactionally maintained
- `gift_cards`: unique code, initial/current balance, issue/expiry/status, optional customer
- `gift_card_events`: append-only ledger containing before/after balances, amount, event type, payment tenders, actor, transaction, source, and idempotency key

Gift-card issue, recharge, redeem, refund, activation, and deactivation are server-side transactions. Direct client mutation of balances is denied.

### POS and accounting trail

- `registers`
- `register_shifts`
- `transactions`
- `transaction_lines` with immutable product/name/SKU/price/cost/VAT/modifier snapshots
- `transaction_tenders`
- `transaction_gift_card_allocations`
- `void_entries`
- `daily_reports`
- join table between reports and transactions when needed
- `audit_entries` as append-only records

Requirements:

- unique `(store_id, client_request_id)` for idempotency
- unique human document/report/shift numbers within their intended store/register/year scope
- refunds reference the original sale in the same store
- finalized financial rows cannot be edited/deleted by the browser
- immutable merchant snapshots remain attached to documents
- report hash-chain fields and canonical payload version are preserved
- document numbering is allocated atomically in PostgreSQL, not by counting browser rows
- checkout writes transaction, lines, tenders, stock, customer totals, gift-card events, audit, and outbox effects in one database transaction

### Operations and webshop

- `business_actions` plus normalized items/references where queryability matters
- `purchase_orders` and `purchase_order_lines`
- `webshop_settings`, coupons, product publication/description/image/variant records
- `webshop_orders` and immutable order lines
- integration configs/logs/webhooks/API-key metadata only after a real server-side secret storage design exists

Third-party credentials and webhook secrets belong in server-side secrets/Vault/Edge Function environment variables. They must never be stored in browser localStorage. API keys must store only a slow hash plus a visible prefix.

## Phase 3 — RLS and database permissions

1. Enable and force RLS on every exposed business table.
2. Revoke default table/function privileges, then grant only the required operations to `authenticated` and selected read-only operations to `anon`.
3. Centralize membership checks in reviewed helper functions that fix `search_path` and cannot be abused to change tenant context.
4. Baseline policy rules:
   - active members can select rows from their store;
   - owner/manager can manage catalog, customers, staff-facing configuration, and operational records;
   - cashier can perform only explicit POS actions;
   - financial writes go through RPCs, not broad table update/delete grants;
   - audit, stock, gift-card events, and finalized financial rows are append-only;
   - users cannot assign themselves a role or membership;
   - store ownership transfer and member invites require privileged server-side workflows.
5. Public webshop reads expose only enabled stores and published/active products through a restricted view or RPC. No internal cost, stock ledger, customer, membership, or audit fields are public.
6. Public order placement uses an Edge Function/RPC with schema validation, rate limiting/CAPTCHA as appropriate, idempotency, price recomputation, stock checks, and no trust in browser totals.
7. Storage policies bind object paths to store membership and file type/size constraints.

Policy tests must use at least Kevin/demo owner, another owner, manager, cashier, unauthenticated client, and service role. Tests explicitly attempt cross-store select/insert/update/delete and foreign-key substitution attacks.

## Phase 4 — Kevin-only demo bootstrap

Do not put production demo ownership into the general `seed.sql`. Supabase seed files are for local resets and do not by themselves safely target the existing hosted Auth user.

Implement a separate idempotent production bootstrap migration/script:

1. Look up `auth.users` by normalized `kevin@webaanzee.be` and assert exactly one row. Abort on zero or duplicates.
2. Upsert Kevin's profile without changing his Auth password or primary email.
3. Create a stable demo store and owner membership for that Auth UUID.
4. Insert the current static categories/products, demo customers, transactions, gift cards/events, merchant settings, webshop settings, and any required report/shift/audit fixtures with deterministic external IDs.
5. Tag all seeded content with a seed version/source and record completion in a private `seed_runs` table.
6. Make reruns idempotent. Never delete or overwrite later live content unless a separately reviewed demo-reset operation is invoked.
7. Demo reset, if retained, is an owner-only server-side operation restricted to the known demo store and demo-tagged rows.

The normal signup/onboarding path never calls this bootstrap and never uses email-domain heuristics. Kevin receives demo data because of this one explicit existing-user binding only.

## Phase 5 — offline cache and synchronization

Keep the offline-first POS behavior, but make the cache tenant-safe:

1. Derive the active store from the authenticated session and membership; never from a caller-provided arbitrary store ID.
2. Open an IndexedDB database whose name includes the store UUID, or add mandatory store keys to every cached table and every query. Per-store database names are simpler and safer for this app.
3. Namespace all relevant localStorage/Zustand keys by store UUID. Device-only theme may stay global; carts, merchant/webshop settings, integration metadata, insights workflow, and seed flags may not.
4. On auth/store change: cancel subscriptions, stop sync, clear in-memory stores, close the old Dexie database, then open/hydrate the selected store cache.
5. On logout: remove session-bound in-memory data and sensitive local values. Decide separately whether encrypted offline records may remain on a trusted POS device.
6. Treat Supabase as authoritative. Cache server row UUIDs, server update versions, sync status, and tombstones.
7. Use an outbox with stable client request IDs, exponential retry, and permanent/conflict states. Financial RPC retries return the original result.
8. Subscribe only to the active store's changes. RLS still applies to Realtime; filters are an efficiency aid, not authorization.
9. Define conflict policy by entity:
   - append-only ledgers: idempotent insert, no last-write-wins;
   - products/settings/customers: optimistic concurrency using `updated_at`/version;
   - stock and gift-card balances: server transactions only;
   - active cart: device-local until checkout unless multi-device carts are explicitly required.

## Phase 6 — frontend Auth replacement

1. Add `@supabase/supabase-js` and a single typed client.
2. Add `.env.example` placeholders for `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; create the real uncommitted environment locally after linking.
3. Replace custom email registration/login with Supabase Auth and auth-state restoration.
4. Load profile, stores, membership, and selected store only after a valid session exists.
5. Remove all account password hashing/storage and the hard-coded Kevin credential hashes.
6. Move authorization checks from only `hasRole()` UI logic to server-enforced RLS/RPC; keep UI checks only for presentation.
7. Remove production calls to `ensureDemoAccount`, static catalog bootstrap, and browser demo transaction generation.
8. Render true empty states for a fresh store and an explicit onboarding route for its first product/settings.
9. Add password reset, confirmation handling, expired-session handling, signout-on-all-devices where useful, and friendly generic Auth errors.

## Phase 7 — test and release gates

### Local database

- Run Supabase locally with Docker.
- `supabase db reset` succeeds from an empty machine using committed migrations/seeds.
- database lint passes and generated TypeScript types are clean.
- SQL tests cover constraints, grants, RLS, Auth trigger idempotency, role permissions, and cross-tenant denial.
- RPC tests cover duplicate checkout, concurrent stock sale, concurrent gift-card redemption, refunds, numbering, and rollback on failure.

### Application

- unit tests cover Supabase Auth state, error paths, logout, cache switching, and outbox behavior.
- E2E: register a new account and assert every business screen is empty.
- E2E: Kevin login sees the demo dataset.
- E2E: Kevin logout then new-user login in the same browser shows no Kevin rows, settings, carts, or demo defaults.
- E2E: two users in different stores cannot access each other's REST, RPC, Realtime, or Storage data even with hand-crafted requests.
- E2E: email confirmation/reset and expired refresh token behavior.
- offline/reconnect E2E verifies one financial result after retries.

### Hosted rollout

1. Take/verify backup.
2. Apply migrations to a staging/preview project first if available.
3. Review `supabase db diff --linked` and migration list before push.
4. Push schema migrations.
5. run Kevin-only demo bootstrap and verify row counts/ownership.
6. configure Auth site URL, exact redirect allow-list, email confirmations, SMTP, templates, and production rate limits.
7. deploy frontend environment with URL + publishable key only.
8. run smoke/isolation checks against hosted project.
9. monitor Auth/database/Edge Function errors and retain a tested rollback/restore path.

## Manual input or action required

Required now:

1. Supabase project access: log the CLI into an account that can access `kkedepbyrarsewofmoao`, or invite the currently logged-in Supabase account to that project with sufficient development privileges. The current CLI token can see other projects but receives a privilege error for this project.

Required before production Auth configuration:

2. The production app URL and any staging/preview URLs, so Auth redirect allow-lists and email links are exact.
3. Access to or credentials for a production SMTP provider if email confirmation, invitations, and password resets will be sent reliably.
4. Docker Desktop running if the full Supabase stack and SQL tests are to run locally.

Product decisions (recommended defaults are safe to proceed with unless changed):

5. Staff identity: recommended = every employee has a Supabase Auth account; PIN is only a device unlock/approval factor.
6. Email confirmation: recommended = required in production, disabled locally for fast tests.
7. New user onboarding: recommended = create an empty named store plus owner membership, then show a setup checklist; never add sample data.
8. Remote preservation: recommended = preserve all existing remote schema/data and baseline it before new migrations.
9. Offline data after logout: recommended = keep only store-scoped cache on explicitly trusted POS devices; otherwise purge it on logout.
10. Demo scope: recommended = migrate every currently visible demo fixture/settings object to Kevin's demo store, while tagging it as demo for an optional reset.

Not required from the user:

- Kevin's existing Supabase password.
- Kevin's Auth UUID; it will be resolved from `auth.users` after safe linking.
- a service-role key for frontend code.
- the database password again; it has already been provided and must not be committed.

## Exact next CLI sequence after access is fixed

```sh
npx supabase projects list
npx supabase link --project-ref kkedepbyrarsewofmoao
npx supabase migration list --linked
npx supabase db pull --linked
npx supabase db dump --linked --data-only --use-copy --file <secure-backup-path>
npx supabase start
npx supabase db reset --local
npx supabase db lint --local
npx supabase gen types typescript --local > src/types/database.generated.ts
```

The backup path must be outside committed source or covered by ignore rules. All generated migrations are reviewed locally before any `db push --linked`.
