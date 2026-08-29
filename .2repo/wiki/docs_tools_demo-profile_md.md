# docs/tools/demo-profile.md

## Purpose

Documents the "demo" deployment profile: a self-contained, in-memory, disposable boot of the real API (no Docker, no Redis/RabbitMQ) used primarily by the paired Vue frontend's e2e suite and secondarily as a zero-setup way to exercise the API locally. It exists so the frontend can test against the actual code rather than a mock, with determinism coming from seeded fixtures.

## Key elements

- **`npm run demo`** — sets `NODE_DEMO=true`, starts `scripts/run-demo-server.ts` on :3000 (or `NODE_PORT`); boots `mongodb-memory-server`, disables Redis/queue, raises rate limits, seeds module fixtures, and boots `src/app.ts`.
- **`POST /__demo/reset`** — in-process: drops the in-memory DB, re-seeds from `src/modules/<name>/demo.ts` fixtures, clears the mailer outbox. Mounted only when `NODE_DEMO=true`; unauthenticated by design.
- **`GET /__demo/emails`** — returns the in-memory outbox captured by the demo mailer (reset/verify tokens extracted). Same gate: `NODE_DEMO` only.
- **`src/kernel/seed-accounts.ts`** — canonical home for the two demo user IDs, credentials, and display fields. Deliberately in the kernel (not `users`) to avoid three cross-module registry edges. Passwords stored plaintext on purpose; never serialized in API responses.
- **"What it deliberately is not"** — section clarifying boundaries: no cache/queue, no persistence, not a mock. Points readers to the live-profile e2e path for those concerns.

## Relationships

- **`scripts/run-demo-server.ts`** — the script this page describes; it is the entry point that performs the memory-server boot, env overrides, and app startup.
- **`src/app.ts`** — the application that `run-demo-server.ts` boots; the demo profile exercises it exactly as any other profile would, plus the two `__demo` routes.
- **`src/infrastructure/adapters/mailer.ts`** — in demo mode this adapter records to an in-memory outbox (`demo-outbox.ts`) instead of calling SMTP; the `GET /__demo/emails` route reads from that outbox.
- **`src/kernel/seed-accounts.ts`** — holds the two fixed credential sets that the paired frontend's `cy.loginAs()` types into a real login form; the docs warn against changing them.
- **`scripts/export-demo-dataset.ts`** — writes `demo-data.json`; the page notes it carries seed-account credentials separately because `password` is `select: false` and won't appear on a serialized user.
- **`docs/api/contract-fragmentation.md`** — sibling doc in the same tools/api cluster; the demo-profile page cross-references `Testing & Docs` (`./testing-and-docs.md`) for what the frontend–API pairing catches, which contract-fragmentation presumably details.

## Notes

- `NODE_DEMO` is set exclusively by `npm run demo`. It is not present in any `.env` example, compose file, or Dockerfile, so the `__demo` routes can never be mounted in a real deployment.
- The two seed accounts' **credentials must stay fixed** — they are hard-typed by the frontend's login helper and quoted in both repos' READMEs.
- The password is stored plaintext in `seed-accounts.ts` intentionally: `userSchema`'s pre-save hook hashes on write, so a pre-hashed value would be double-hashed and lose its plaintext. The field is `select: false` so it never leaks via API.
- Four modules (`users`, `orders`, `cart`, `wishlist`) need a reference to these accounts; the ids are repeated in each rather than imported from `users`, to avoid a `shared-kernel` registry edge for six string literals.
- Cache and queue are `disabled` (reported as `disabled` in `/observability/health`, not an error), so invalidation and queue-backed email/PDF paths are **not** exercised here — that is the live-profile (`compose:restart`) e2e's job.
