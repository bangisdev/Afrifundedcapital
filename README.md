[![E2E Matrix](https://github.com/bangisdev/Afrifundedcapital/actions/workflows/e2e-matrix.yml/badge.svg)](https://github.com/bangisdev/Afrifundedcapital/actions/workflows/e2e-matrix.yml) [![E2E Tests](https://github.com/bangisdev/Afrifundedcapital/actions/workflows/e2e.yml/badge.svg)](https://github.com/bangisdev/Afrifundedcapital/actions/workflows/e2e.yml)

## Overview

This project uses the following tech stack:
- Vite
- Typescript
- React Router v7 (all imports from `react-router` instead of `react-router-dom`)
- React 19 (for frontend components)
- Tailwind v4 (for styling)
- Shadcn UI (for UI components library)
- Lucide Icons (for icons)
- Hono (HTTP API server, mounted into Vite as a plugin)
- SQLite + Drizzle ORM (database)
- Custom session auth (scrypt hashing + HttpOnly cookies)
- TanStack Query (server-state fetching)
- Framer Motion (for animations)
- Three js (for 3d models)

All relevant files live in the 'src' directory.

Use bun for the package manager.

## Architecture

### System map

```
┌────────────────────────── Frontend (Vite + React 19) ─────────────────────────┐
│  src/main.tsx — Router + QueryClientProvider + Suspense                        │
│    /            → Landing.tsx                                                  │
│    /auth        → Auth.tsx (redirectAfterAuth = /dashboard)                    │
│    /dashboard/* → Dashboard shell (RequireAuth)                                │
│    /admin/*     → AdminDashboard (RequireAuth + admin role guard)              │
│                                                                                │
│  Data layer                                                                     │
│    src/lib/api.ts        shared fetch wrapper (api.get/post/put/delete)        │
│    src/hooks/use-api.ts  useApiQuery / useApiMutation (TanStack Query)         │
│    src/hooks/use-auth.ts session state (GET /api/auth/session)                 │
└──────────────────────────────┬──────────────────────────────────────────────────┘
                               │ fetch("/api/…", { credentials: "include" })
                               ▼
┌────────────────── Backend (Hono, mounted as a Vite plugin) ────────────────────┐
│  src/server/index.ts — Hono app; initDatabase() on load                         │
│    CORS → session middleware → /api/* route modules                             │
│    users · challenges · payments · wallets · kyc · support · coupons ·          │
│    certificates · affiliates · trading · payouts · seed · test-email ·          │
│    admin/secrets                                                               │
│  src/server/middleware.ts  requireAuth / requireAdmin                          │
│  src/server/db.ts · schema.ts · migrate.ts  better-sqlite3 + Drizzle           │
│  libs: email.ts · secrets.ts · payments.ts · audit.ts · mt5/ (config,          │
│        provider, scheduler, sync, reconciliation, retry-queue)                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Stack notes**

- One process serves both the SPA and the `/api/*` endpoints: the Hono app is a **Vite plugin** in `src/server/index.ts`. The `src/convex/` files are unused template stubs — the template's Convex/auth sections further down describe the original scaffold, not the live app.
- The database is SQLite via `better-sqlite3` + Drizzle (schema in `src/server/schema.ts`, migrations in `src/server/migrate.ts`).
- Auth is **session-cookie based**: scrypt-hashed passwords, an HttpOnly `afc_session` cookie (7-day expiry), and `requireAuth` / `requireAdmin` middleware. No JWT.
- Client state uses **TanStack Query** over the shared `src/lib/api.ts` fetch wrapper.

### Request lifecycle

```
1  A page calls useApiQuery / useApiMutation (or a raw fetch in an event handler)
2  src/lib/api.ts request() → fetch with credentials: "include"
3  The Vite dev server routes /api/* to the Hono app
4  Middleware (requireAuth / requireAdmin) resolves the afc_session cookie against the DB
5  The route handler runs — reads/writes SQLite via Drizzle (getDb()) or calls a lib
6  The handler returns c.json(...) — JSON on success AND on error
7  The client parses via readResponseBody() — JSON first, raw-text fallback, so a
   reverse-proxy 503 ("Service unavailable" while the app server restarts) can never
   crash the UI with a JSON SyntaxError
8  Errors map through errorMessageOf() to a friendly toast; successes invalidate queries
```

> Seeing "The server is temporarily unavailable — please try again in a moment." means a proxy 502/503 was returned because the app server was mid-restart; wait a moment and retry.

### Trace: Send Test Email (Admin → Settings → Resend)

The end-to-end path behind the test-email feature:

```
AdminSettings.tsx  sendTestEmail()
  → POST /api/test-email/send-test        { to, apiKey? }   (requireAuth + requireAdmin)
  → routes/test-email.ts                  persists only fromEmail (never the API key)
  → lib/email.ts  sendEmail()             resolves RESEND_API_KEY via getSecret()
                                          (admin override → env var), lazy Resend client
  → Resend SDK  emails.send()             wrapped in an 8s timeout — a slow/unreachable
                                          API fails fast instead of hanging into a proxy
                                          503 "Service unavailable"
  → { ok, reason } → 200 { success: true } | 500 { error: "Failed to send email: <reason>" }
  → client toast via readResponseBody() + errorMessageOf()
```

### Runtime secret store (Admin → Settings)

Gateway credentials can be updated in-app without a redeploy; they are never stored in plaintext.

```
SecretKeyField  →  PUT/DELETE /api/admin/secrets/:name      (admin-only, audit-logged)
  → routes/secrets.ts   masked responses — raw values never leave the server
  → lib/secrets.ts      AES-256-GCM; rows under secret_override:* in the settings
                        table; master key derived from APP_SECRETS_KEY only
  Consumers resolve  admin override → env var → (MT5) legacy stored value:
    email.ts         RESEND_API_KEY
    payments.ts      FLW_SECRET_KEY / FLW_SECRET_HASH
    mt5/config.ts    MT5_GATEWAY_API_KEY / MT5_MANAGER_PASSWORD
                     (written via PUT /api/trading/admin/config, stripped from plaintext JSON)
```

### Key files in these flows

| File | Role |
| --- | --- |
| `src/lib/api.ts` | Shared fetch wrapper; `readResponseBody` / `errorMessageOf` make every page immune to non-JSON 503 bodies |
| `src/hooks/use-api.ts` | TanStack Query bindings (`useApiQuery` / `useApiMutation`) + sign-in/up error handling |
| `src/pages/admin/AdminSettings.tsx` | Secret badges/update fields (`SecretKeyField`) + the Send Test Email form |
| `src/server/routes/test-email.ts` | `GET /status` (masked key status) + `POST /send-test` (admin-only, fail-fast) |
| `src/server/lib/email.ts` | `sendEmail` with 8s timeout returning `{ ok, reason }`; used by notifications, payouts, test-email |
| `src/server/lib/secrets.ts` / `routes/secrets.ts` | Encrypted runtime secret store + admin API |
| `src/server/routes/trading.ts` / `lib/mt5/config.ts` | MT5 gateway keys routed through the secret store |
| `scripts/check-secrets.sh` + `.gitleaks.toml` | CI gates: block committed secret values (see [Security → Committed-secret guard](#committed-secret-guard-checksecrets)) |

### Testing & CI map

- **Unit/integration (Vitest):** server tests in `src/server/__tests__/` run in a node environment against a fresh SQLite DB via `buildTestApp()` (see `src/server/__tests__/setup.ts`); frontend tests in `src/__tests__/` run in jsdom. Use `bun run test`.
- **E2E (Playwright):** `e2e/admin-flow.spec.ts` is split into greppable chunks (see package.json `test:e2e:*` scripts); each chunk boots its own Vite server on port 5174 with `E2E_TESTING=1` and an isolated `.e2e/` DB.
- **CI:** `.github/workflows/e2e.yml` / `e2e-matrix.yml` run the e2e chunks in parallel plus a `secrets-scan` job; `secret-scan.yml` runs gitleaks.

## Setup

This project is set up already and running on a cloud environment, as well as a convex development in the sandbox.

## Environment Variables

Third-party credentials are managed as **environment variables — never stored in the database**. Set them in the platform's **Keys/API keys** tab (or in your deployment environment). The admin **Settings** page surfaces their runtime status as green "From env · …abcd" / amber "Not configured" badges and never returns raw values, only a masked tail (last 4 characters) for display.

### Payment gateway (Flutterwave)

| Env var | Visibility | Used for |
| --- | --- | --- |
| `FLW_PUBLIC_KEY` | Client-safe (public) | Checkout and the Admin → Settings → Flutterwave tab |
| `FLW_SECRET_KEY` | Server-only | Verifying transactions (`/api/payments/verify`) and issuing refunds (`POST /api/payments/admin/:id/refund`) |
| `FLW_SECRET_HASH` | Server-only | Validating webhook signatures (`verif-hash` header) and signing the admin "test webhook" |

Only the public key may be persisted (in the `flutterwave_config` setting). The secret key and hash are read from the environment at request time and never written to the database or returned to the client — the admin API exposes only `secretKeyConfigured` / `secretHashConfigured` plus a masked tail.

> The Paystack tab in Admin Settings manages `PAYSTACK_SECRET_KEY` under the same model — it can be updated in-app (stored encrypted) or set via the environment; see [Runtime-managed secrets](#runtime-managed-secrets-admin--settings).

### Email (Resend)

| Env var | Used for |
| --- | --- |
| `RESEND_API_KEY` | Transactional email (KYC, payments, support, payouts, referrals, security alerts) |
| `RESEND_EMAIL_FROM` | Optional sender-address override (falls back to the stored `fromEmail`, then `AfriFundedCapital <onboarding@resend.dev>`) |

`GET /api/test-email/status` exposes only `apiKeyConfigured` and a masked key. The "Send test email" form (admin-only `POST /api/test-email/send-test`) may accept a one-off key for a single send — it is used in memory and never persisted. Sends fail fast (8s timeout) with a specific reason — missing key, Resend API error, or timeout — rather than hanging the request until a proxy 503.

### App & infrastructure

| Env var | Used for |
| --- | --- |
| `APP_URL` | Base URL baked into transactional email links (confirmations, alerts, etc.) |
| `DB_PATH` | SQLite database file path (the Docker image defaults to `/app/data/afrifundedcapital.db`) |

### Platform-managed

- **Client (`VITE_*`)**: `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL` are set by the platform.
- **Convex backend**: `JWKS`, `JWT_PRIVATE_KEY`, and `SITE_URL` are consumed by the auth layer via the Convex environment.

E2E-only variables (`PLAYWRIGHT_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_TESTING`) are documented under [End-to-end tests](#end-to-end-tests-playwright).


# Using Authentication (Important!)

You must follow these conventions when using authentication.

## Auth is already set up.

All convex authentication functions are already set up. The auth currently uses email OTP and anonymous users, but can support more.

The email OTP configuration is defined in `src/convex/auth/emailOtp.ts`. DO NOT MODIFY THIS FILE.

Also, DO NOT MODIFY THESE AUTH FILES: `src/convex/auth.config.ts` and `src/convex/auth.ts`.

## Using Convex Auth on the backend

On the `src/convex/users.ts` file, you can use the `getCurrentUser` function to get the current user's data.

## Using Convex Auth on the frontend

The `/auth` page is already set up to use auth. Navigate to `/auth` for all log in / sign up sequences.

You MUST use this hook to get user data. Never do this yourself without the hook:
```typescript
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

## Protected Routes

When protecting a page, use the auth hooks to check for authentication and redirect to /auth.

## Auth Page

The auth page is defined in `src/pages/Auth.tsx`. Redirect authenticated pages and sign in / sign up to /auth.

## Authorization

You can perform authorization checks on the frontend and backend.

On the frontend, you can use the `useAuth` hook to get the current user's data and authentication state.

You should also be protecting queries, mutations, and actions at the base level, checking for authorization securely.

## Adding a redirect after auth

In `src/main.tsx`, you must add a redirect after auth URL to redirect to the correct dashboard/profile/page that should be created after authentication.

# Frontend Conventions

You will be using the Vite frontend with React 19, Tailwind v4, and Shadcn UI.

Generally, pages should be in the `src/pages` folder, and components should be in the `src/components` folder.

Shadcn primitives are located in the `src/components/ui` folder and should be used by default.

## Page routing

Your page component should go under the `src/pages` folder.

When adding a page, update the react router configuration in `src/main.tsx` to include the new route you just added.

## Shad CN conventions

Follow these conventions when using Shad CN components, which you should use by default.
- Remember to use "cursor-pointer" to make the element clickable
- For title text, use the "tracking-tight font-bold" class to make the text more readable
- Always make apps MOBILE RESPONSIVE. This is important
- AVOID NESTED CARDS. Try and not to nest cards, borders, components, etc. Nested cards add clutter and make the app look messy.
- AVOID SHADOWS. Avoid adding any shadows to components. stick with a thin border without the shadow.
- Avoid skeletons; instead, use the loader2 component to show a spinning loading state when loading data.


## Landing Pages

You must always create good-looking designer-level styles to your application. 
- Make it well animated and fit a certain "theme", ie neo brutalist, retro, neumorphism, glass morphism, etc

Use known images and emojis from online.

If the user is logged in already, show the get started button to say "Dashboard" or "Profile" instead to take them there.

## Responsiveness and formatting

Make sure pages are wrapped in a container to prevent the width stretching out on wide screens. Always make sure they are centered aligned and not off-center.

Always make sure that your designs are mobile responsive. Verify the formatting to ensure it has correct max and min widths as well as mobile responsiveness.

- Always create sidebars for protected dashboard pages and navigate between pages
- Always create navbars for landing pages
- On these bars, the created logo should be clickable and redirect to the index page

## Animating with Framer Motion

You must add animations to components using Framer Motion. It is already installed and configured in the project.

To use it, import the `motion` component from `framer-motion` and use it to wrap the component you want to animate.


### Other Items to animate
- Fade in and Fade Out
- Slide in and Slide Out animations
- Rendering animations
- Button clicks and UI elements

Animate for all components, including on landing page and app pages.

## Three JS Graphics

Your app comes with three js by default. You can use it to create 3D graphics for landing pages, games, etc.


## Colors

You can override colors in: `src/index.css`

This uses the oklch color format for tailwind v4.

Always use these color variable names.

Make sure all ui components are set up to be mobile responsive and compatible with both light and dark mode.

Set theme using `dark` or `light` variables at the parent className.

## Styling and Theming

When changing the theme, always change the underlying theme of the shad cn components app-wide under `src/components/ui` and the colors in the index.css file.

Avoid hardcoding in colors unless necessary for a use case, and properly implement themes through the underlying shad cn ui components.

When styling, ensure buttons and clickable items have pointer-click on them (don't by default).

Always follow a set theme style and ensure it is tuned to the user's liking.

## Toasts

You should always use toasts to display results to the user, such as confirmations, results, errors, etc.

Use the shad cn Sonner component as the toaster. For example:

```
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
export function SonnerDemo() {
  return (
    <Button
      variant="outline"
      onClick={() =>
        toast("Event has been created", {
          description: "Sunday, December 03, 2023 at 9:00 AM",
          action: {
            label: "Undo",
            onClick: () => console.log("Undo"),
          },
        })
      }
    >
      Show Toast
    </Button>
  )
}
```

Remember to import { toast } from "sonner". Usage: `toast("Event has been created.")`

## Dialogs

Always ensure your larger dialogs have a scroll in its content to ensure that its content fits the screen size. Make sure that the content is not cut off from the screen.

Ideally, instead of using a new page, use a Dialog instead. 

# Using the Convex backend

You will be implementing the convex backend. Follow your knowledge of convex and the documentation to implement the backend.

## The Convex Schema

You must correctly follow the convex schema implementation.

The schema is defined in `src/convex/schema.ts`.

Do not include the `_id` and `_creationTime` fields in your queries (it is included by default for each table).
Do not index `_creationTime` as it is indexed for you. Never have duplicate indexes.


## Convex Actions: Using CRUD operations

When running anything that involves external connections, you must use a convex action with "use node" at the top of the file.

You cannot have queries or mutations in the same file as a "use node" action file. Thus, you must use pre-built queries and mutations in other files.

You can also use the pre-installed internal crud functions for the database:

```ts
// in convex/users.ts
import { crud } from "convex-helpers/server/crud";
import schema from "./schema.ts";

export const { create, read, update, destroy } = crud(schema, "users");

// in some file, in an action:
const user = await ctx.runQuery(internal.users.read, { id: userId });

await ctx.runMutation(internal.users.update, {
  id: userId,
  patch: {
    status: "inactive",
  },
});
```


## Common Convex Mistakes To Avoid

When using convex, make sure:
- Document IDs are referenced as `_id` field, not `id`.
- Document ID types are referenced as `Id<"TableName">`, not `string`.
- Document object types are referenced as `Doc<"TableName">`.
- Keep schemaValidation to false in the schema file.
- You must correctly type your code so that it passes the type checker.
- You must handle null / undefined cases of your convex queries for both frontend and backend, or else it will throw an error that your data could be null or undefined.
- Always use the `@/folder` path, with `@/convex/folder/file.ts` syntax for importing convex files.
- This includes importing generated files like `@/convex/_generated/server`, `@/convex/_generated/api`
- Remember to import functions like useQuery, useMutation, useAction, etc. from `convex/react`
- NEVER have return type validators.

# MT5 Integration

AfriFundedCapital syncs live trading data from MetaTrader 5 through a **self-hosted gateway** that wraps the official **MT5 Manager API** (the standard bridging pattern — the Manager API is a binary/C++ protocol that cannot be called directly from Node).

## How it works

- The app holds an `MT5Provider` seam (`src/server/lib/mt5/types.ts`) with two implementations:
  - `HttpMT5Provider` — the real connector. Talks to one or more gateway base URLs (failover) over HTTPS with a `Bearer` API key. Handles timeouts, exponential-backoff retries, and classifies transient failures (`MT5GatewayError`) for the retry queue. Manager credentials are stored in the DB and **never** returned to the client.
  - `SimulatedMT5Provider` — deterministic fallback used when no gateway is configured, so demos and tests keep working. Demo data only moves when a user/admin explicitly triggers a sync.
- **Metrics are real**: win rate, profit factor, streaks, and drawdowns are derived from actual closed trades fetched from the gateway — no random generation.
- **Retry queue** (`mt5_sync_queue`) persists failed gateway operations; **reconciliation** (`mt5_reconciliation`) compares gateway vs. local account state. Both are exposed to admins.

## Configuration

Configure the gateway in **Admin → Settings → MT5** (persisted as the `mt5_config` JSON key in the settings table), or via `PUT /api/trading/admin/config`. Fields:

| Field | Description |
| --- | --- |
| `enabled` | Master switch for the gateway |
| `baseUrls` | One or more gateway URLs for failover (e.g. `https://mt5-gw-1.internal:8443`) |
| `apiKey` | Shared gateway API key (`Authorization: Bearer …`) |
| `managerLogin` / `managerPassword` | MT5 manager account used to connect to the Manager API |
| `group` / `leverage` / `serverName` | Defaults applied to newly created accounts |
| `requestTimeoutMs` / `maxRetries` / `retryBaseDelayMs` | Timeout and backoff tuning |
| `reconciliationTolerance` | |Δ| (currency units) under which local vs. gateway balances count as matched |

## Background scheduler

`src/server/lib/mt5/scheduler.ts` (started from both the dev plugin and production `server.ts`) replaces the old manual-only daily sync:

- **Retry queue drain** every 5 minutes (exponential backoff per job).
- **Daily sync pass** every hour for active challenges that haven't synced in the last 23 hours.
- The scheduler is a **no-op when no gateway is configured**, so simulated mode never moves demo data on its own.

## Admin API (all require admin auth, under `/api/trading`)

| Endpoint | Purpose |
| --- | --- |
| `GET /admin/status` | Provider mode + gateway health summary |
| `GET /admin/config` / `PUT /admin/config` | Read (redacted) / update gateway config |
| `POST /admin/test-connection` | Ping the gateway with the stored config |
| `GET /admin/queue` | Retry queue listing |
| `POST /admin/queue/process` | Drain the queue on demand |
| `POST /admin/queue/:id/retry` / `POST /admin/queue/retry-all` | Retry failed jobs |
| `POST /admin/reconcile` / `GET /admin/reconcile/history` | Run / inspect reconciliation runs |
| `POST /admin/sync-all` | Force a sync pass for all active challenges |

## Going live

1. Deploy the MT5 gateway (one of the standard open-source Manager API bridges) with your broker server's Manager API credentials.
2. Set `enabled: true`, the gateway `baseUrls`, `apiKey`, and manager credentials in Admin → Settings → MT5.
3. Click **Test connection** in the admin MT5 page — the scheduler starts syncing, retrying, and reconciling automatically.

# Security

## Committed-secret guard (`check:secrets`)

`bun run check:secrets` (or `bash scripts/check-secrets.sh`) scans the working tree and exits `1` if any payment, email, JWT, SMTP, or MT5 gateway secret values have been committed. When scanning the repo itself (no target dir) it also runs the alignment check (`scripts/check-alignment.sh`) as stage 2, so one command covers both the working tree and config sync. It runs as the `secrets-scan` job in both workflow files (see [Testing → CI](#ci)) on every push and PR, in parallel with the e2e matrix.

The same patterns are enforced pre-commit by **gitleaks** (`.gitleaks.toml`, run in `.github/workflows/secret-scan.yml`) — the two configs are kept in sync. gitleaks is deliberately the stricter superset: it also flags public keys (`FLWPUBK-…`, `pk_live_…`) and generic `api_key` / `secret_key` / MT5 `managerPassword` assignments, which this gate intentionally ignores to stay deterministic.

The check deliberately matches secret **values**, not env-var names — references like `process.env.FLW_SECRET_KEY` appear all over the codebase legitimately, but a real Flutterwave secret starts with `FLWSECK`, and a real Resend API key is `re_` + 24+ characters. Assignment patterns accept `.env` (`KEY=value`), YAML (`key: value`), and JSON (`"KEY": "value"`) quoting forms.

### What gets flagged

| Secret class | Matched shape |
| --- | --- |
| Flutterwave (payment gateway) | `FLWSECK-…` / `FLWSECK_TEST-…` values (the public `FLWPUBK` prefix is safe) |
| Resend (email) | `re_` + 24+ alphanumeric characters |
| Hardcoded gateway / JWT / SMTP assignments | `FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `RESEND_API_KEY`, `PAYSTACK_SECRET_KEY`, `JWT_PRIVATE_KEY`, `SMTP_PASS`, `SMTP_PASSWORD`, `MT5_API_KEY`, `MT5_GATEWAY_API_KEY`, `MT5_MANAGER_PASSWORD` followed by `=` or `:` and a real-looking value (8+ chars) |
| MT5 gateway `apiKey` / `managerPassword` fields | Hardcoded `apiKey: …` / `apiKey = …` / `"apiKey": "…"` (and the same for `managerPassword`) with a 16+ char token containing ≥1 non-letter (skips camelCase code expressions like `rawManagerPassword` / `cfg.apiKey`, type declarations, and derived fields such as `apiKeyLast4` / `hasApiKey`) |
| Private keys & other gateway secrets | PEM private-key blocks (`-----BEGIN … PRIVATE KEY-----`) and Paystack/Stripe secret values (`sk_live_…` / `sk_test_…` + 16+ chars) — mirrors `.gitleaks.toml` |

### What is deliberately not flagged

- **`SMTP_HOST` / `SMTP_PORT` / `SMTP_USER`** — connection metadata, not secrets.
- **`__tests__` directories** — unit tests carry intentional mock credentials (e.g. `payments.test.ts`) to verify secrets are scrubbed from the DB and never rendered; those are fake by design. GitHub's own secret scanning still covers test files for real keys.
- **Public keys** — `FLWPUBK-…` / `pk_live_…` are not secrets; gitleaks flags them for completeness, but this gate deliberately does not.
- **Placeholders & indirection** — `(production key)` forms, `$VAR` references, empty / `""` values, and docs or comments that merely *name* the env vars or describe the key formats.

### Example

```bash
bun run check:secrets           # exit 0 when clean
bash scripts/check-secrets.sh   # exit 1 + prints the offending file:line list
```

### Self-test

`bash scripts/gitleaks-fixture.sh` (or `bun run test:secrets-fixture`) generates a temporary fixture covering every shape both gates must catch and asserts that `check:secrets` trips on the secrets while ignoring placeholders — and, if gitleaks is installed (or `GITLEAKS_BIN` points at it), that gitleaks fires all nine custom rules on the same shapes. The fixture is built from shell fragments at runtime, so the script itself never trips either gate.

`bash scripts/check-alignment.sh` (or `bun run test:secrets-alignment`) statically asserts the two configs stay in sync: the same 10 hardcoded env-var names, byte-identical shared regexes (Flutterwave, Resend, `sk_*`, PEM), matching 16+/8+ token thresholds and matching exclusions, plus the documented public-key divergence. It also runs automatically as stage 2 of `bun run check:secrets` when scanning the repo. Run both after changing `scripts/check-secrets.sh` or `.gitleaks.toml`.

## Runtime-managed secrets (Admin → Settings)

Gateway API keys (`FLW_SECRET_KEY`, `FLW_SECRET_HASH`, `RESEND_API_KEY`, `PAYSTACK_SECRET_KEY`, `SMTP_PASSWORD`, `MT5_GATEWAY_API_KEY`, `MT5_MANAGER_PASSWORD`, `JWT_PRIVATE_KEY`) can also be updated in-app from **Admin → Settings** (Flutterwave / Paystack / Resend / SMTP / MT5 / Security tabs), without touching the deployment environment. Updates are stored in the `settings` table under `secret_override:<NAME>` keys, encrypted at rest with **AES-256-GCM**, and take effect immediately — the admin DB override resolves first, with the environment variable as the fallback, so a revoked environment key can be replaced without a redeploy. The MT5 gateway API key **and manager password** use the same store: saving them on the Admin MT5 page or the Settings → MT5 tab writes the encrypted overrides, and `getMT5Config` resolves override → env → legacy stored value, so neither is ever persisted in plaintext settings. `JWT_PRIVATE_KEY` (Settings → Security) is managed the same way.

- **Master key:** derived (SHA-256, domain-separated) from `APP_SECRETS_KEY` only — `JWT_PRIVATE_KEY` is itself one of the managed secrets, so it can never be used to encrypt the store (that would be circular). Set `APP_SECRETS_KEY` in the platform Keys/API keys tab to make updates permanent. Without it, overrides still work but are encrypted with an ephemeral key and lost on restart — the settings page shows a warning banner in that case.
- **API:** `GET /api/admin/secrets` (status + source per key), `PUT /api/admin/secrets/:name` (set), `DELETE /api/admin/secrets/:name` (clear) — all admin-only, audit-logged (`secrets.updated` / `secrets.cleared`) with values never written to the trail, and other admins are alerted via the existing security-event notifications.
- The generic `GET /api/seed/settings` endpoint never returns override rows, and the boot-time `scrubStoredSecrets` pass leaves them untouched (they hold ciphertext only).

# Testing

## Unit & integration tests (Vitest)

The project has 48 test files: server tests (`src/server/__tests__/*.test.ts`, node environment — routes, auth, KYC, payments, MT5 connector, retry-queue backoff, reconciliation drift, scheduler) and frontend tests (`src/__tests__/*.test.tsx`, jsdom environment — pages and the full user journey).

The `test` script runs the two environments as **two separate phases** (`src/server/__tests__` first, then `src/__tests__`). Bun's runtime cannot switch vitest's environment (node → jsdom) inside a single fork (`pool: "forks"` + `singleFork: true`), which corrupted shared global state when all 48 files ran in one command. Splitting keeps every file in one homogeneous environment, so `bun run test` is green under Bun and Node alike.

```bash
bun run test       # run once (server tests, then frontend tests)
bun run test:watch # watch mode
bun run test:coverage  # with coverage report
```

> ⚠️ **Use `bun run test`, not bare `bun test`.** `bun test` invokes Bun's **native** test runner instead of the npm script: it auto-discovers the Playwright spec (`e2e/admin-flow.spec.ts`), chokes on its `test.describe()`, and exposes an incomplete `vi` object (no `vi.mocked` / `vi.stubGlobal`), producing cascade of false failures across `src/__tests__`. Always run unit tests via `bun run test`.

## End-to-end tests (Playwright)

The admin-flow e2e suite lives in `e2e/` and drives the real UI in Chromium: landing → auth → admin overview → user management → challenges → payments → cross-page navigation → responsive viewports.

### Prerequisites

1. Install Playwright's Chromium (one-time):

   ```bash
   bunx playwright install chromium
   ```

2. A running app instance. The config (`playwright.config.ts`) auto-boots `bun run dev` before the run and reuses an already-listening server on the port (the Freebuff preview qualifies), so usually you don't need to start anything yourself.

### Run against a local dev server

```bash
# Start the dev server (or rely on the Freebuff preview), then:
bun test:e2e                      # full suite
bun test:e2e -- --grep "Payments" # single section
bun test:e2e:ui                   # interactive UI mode
bun test:e2e:debug                # step-through debugger
```

Point the suite at a specific server with `PLAYWRIGHT_BASE_URL`:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 bun test:e2e
```

### How admin auth is seeded

`e2e/global-setup.ts` runs once before the suite and calls `POST /api/seed/admin` to guarantee a super-admin exists (idempotent — a 409 for an existing admin is treated as success). Defaults, overridable via env:

| Env var | Default |
| --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:5173` |
| `E2E_ADMIN_EMAIL` | `admin@afrifundedcapital.com` |
| `E2E_ADMIN_PASSWORD` | `Admin@123456` |

The spec signs in through the real `/auth` page, so it exercises the app's actual password auth flow.

### Rate limiting during e2e runs

The app rate-limits sign-in (5/15 min per IP) and locks accounts after 5 failed attempts. A serial suite that signs in dozens of times from one IP would trip that — so `playwright.config.ts` boots the web server with `E2E_TESTING=1`, which bypasses the in-memory limiter and lockout for that process only (see `src/server/middleware.ts`). Production and normal dev traffic are unaffected.

The same flag accelerates the MT5 background scheduler (`src/server/lib/mt5/scheduler.ts`) so section 10 of the e2e suite can observe it firing on its own: the retry-queue pass runs every ~4s (vs 5 min) and the sync pass every ~8s (vs hourly), and the simulated provider is allowed to drive the loop (normally a no-op without a live gateway). Tests seed the exact conditions through the E2E-only hook `POST /api/trading/admin/scheduler/e2e-setup` (404 outside `E2E_TESTING`), then assert the queue drains and stale challenges get synced without any manual button click.

### CI

`CI=true bun test:e2e` runs with retries and forbids `test.only`. In headless environments the Freebuff platform cold-start overlay can delay first paint, so the suite's `warmUp` helper retries page loads; when running against a raw local dev server this isn't an issue.

Every push and PR also runs the `secrets-scan` job — `bun run check:secrets` — in parallel with the e2e matrix (see [Security → Committed-secret guard](#committed-secret-guard-checksecrets)).
