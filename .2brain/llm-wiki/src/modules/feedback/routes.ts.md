---
source: src/modules/feedback/routes.ts
sha256: 5d15511e9ba29dd537ed1ab00962820cc113587738dbbcd3c8952f9a14042cdb
generated_at: 2026-09-27T14:53:29.719861+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/routes.ts

## Purpose

Defines the Express route table for the feedback/contact module. It exposes exactly one public endpoint (the visitor contact form) and a set of admin-only endpoints for reading, updating, and deleting submitted feedback. Security is enforced positionally: the public route is mounted above a shared auth gate, so everything below it is automatically admin-gated without per-route repetition.

## Key elements

- **`router`** (exported) — The single Express `Router` instance; the module's entry point for mounting.
- **`POST /contact`** — Public contact form. Middleware chain: `contactLimiters` → `humanChallengeGate` → `idempotencyKey` → `postFeedbackContact`. No auth; protected instead by rate limits and the anti-bot challenge.
- **`router.use(getAuth, isAuthOrCredential)`** — Positional auth gate. Every route registered after this line requires an authenticated session or API credential.
- **`POST /search`** — Admin feedback search with filters. Uses POST (not GET) because the request body carries filter params; `GET` bodies have no defined semantics. Per-route permission: `feedback.any.read`.
- **`GET /`** — Admin list/view feedback. Permission: `feedback.any.read`. Cached with `privateNoCache`.
- **`PUT /:id`** — Full replacement of a feedback's status (`replaceFeedbackStatus`). Permission: `feedback.any.update`.
- **`PATCH /:id`** — Partial merge of a feedback's status (`updateFeedbackStatus`). Permission: `feedback.any.update`.
- **`DELETE /:id`** — Remove a feedback entry. Permission: `feedback.any.delete`.

## Relationships

- **`@kernel/middlewares/authorizations`** — Provides `getAuth`, `isAuthOrCredential`, and `requirePermission` used in the route chain and per-route permission checks.
- **`./controllers/*`** — Each route delegates to a dedicated controller (`postFeedbackContact`, `getFeedback`, `replaceFeedbackStatus`, `updateFeedbackStatus`, `deleteFeedback`); this file contains no business logic.
- **`./rate-limits`** — Supplies `contactLimiters` (three dimensions: address, submitted email, address block) applied to the public contact route before any write.
- **`@infrastructure/http/middlewares/cache`** — `noStore` on the POST endpoints (search, contact); `privateNoCache` on `GET /`.
- **`@infrastructure/http/middlewares/human-challenge`** — `humanChallengeGate` (rung-3 anti-bot, disabled unless `NODE_ANTIBOT_PROVIDER` is set) on `POST /contact`.
- **`@infrastructure/http/middlewares/idempotency`** — `idempotencyKey` on `POST /contact` to deduplicate repeated submissions.
- **`./module.ts`** — Consumes the exported `router` to register these routes in the application.
- **`tests/unit/routes.test.ts`** — Unit-tests the route definitions and middleware ordering in this file.
- **`tests/support/routed-modules.ts`** — Test-harness helper that mounts this router for cross-cutting and integration tests.

## Notes

- **Positional security model.** The auth gate is a `router.use` call, not a per-route middleware. A route appended *above* the gate is public; one *below* it is admin-only. There is no explicit "public" flag. `tests/cross-cutting/authenticated-controllers.test.ts` is the safety net that catches a route accidentally placed in the wrong half.
- **`POST /search` is a semantic workaround, not a design choice.** It exists solely to carry a filter body; the comment explicitly notes it is mounted before any `/:id` route so the literal string `"search"` cannot be shadowed as an id.
- **PUT vs PATCH.** `PUT /:id` replaces the status wholesale (`replaceFeedbackStatus`); `PATCH /:id` merges partial fields (`updateFeedbackStatus`). Both require `feedback.any.update`.
- **Cache policy is asymmetric by design.** Write endpoints (all POSTs, PUT, PATCH, DELETE) get `noStore`; the admin `GET /` gets `privateNoCache` (browser may retain a copy but must revalidate). The rationale cited is RFC 9111 §3.5 — a shared/immutable cache must never hold an admin-only queue.
