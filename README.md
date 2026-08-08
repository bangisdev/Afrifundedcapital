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
- Convex (for backend & database)
- Convex Auth (for authentication)
- Framer Motion (for animations)
- Three js (for 3d models)

All relevant files live in the 'src' directory.

Use bun for the package manager.

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

> The Paystack tab in Admin Settings references `PAYSTACK_SECRET_KEY` under the same model: gateway secrets belong in the environment, not the database.

### Email (Resend)

| Env var | Used for |
| --- | --- |
| `RESEND_API_KEY` | Transactional email (KYC, payments, support, payouts, referrals, security alerts) |
| `RESEND_EMAIL_FROM` | Optional sender-address override (falls back to the stored `fromEmail`, then `AfriFundedCapital <onboarding@resend.dev>`) |

`GET /api/test-email/status` exposes only `apiKeyConfigured` and a masked key. The "Send test email" form may accept a one-off key for a single send — it is used in memory and never persisted.

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
