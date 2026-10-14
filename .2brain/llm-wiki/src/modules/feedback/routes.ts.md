---
source: src/modules/feedback/routes.ts
sha256: cf327c0620a0c3ee6192e6cee6d88783f29a35b651c450279538eb46ef3045e0
generated_at: 2026-10-14T15:50:50.405363+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/routes.ts

## Purpose

Express router that defines the HTTP route table for the feedback module: one public visitor contact-form endpoint and a set of admin-only endpoints for reading, updating, and deleting submitted feedback entries. The single exported `router` is what `module.ts` mounts into the application.

## Key elements

- **`router`** (exported) — the sole export; an `express.Router()` with five handler registrations.
- **`POST /contact`** — the only public route. Middleware chain: `contactLimiters` → `humanChallengeGate` → `idempotencyKey` → `postFeedbackContact` controller.
- **`router.use(getAuth, isAuthOrCredential)`** — positional auth gate; every route defined *after* this line is admin-only. The public route above it is unaffected.
- **`POST /search`** — filtered feedback listing (uses POST body for query params because GET has no defined body semantics). Gated by `feedback.any.read`, tagged `noStore`.
- **`GET /`** — unfiltered feedback listing. Gated by `feedback.any.read`, tagged `privateNoCache`.
- **`PUT /:id`** — replace status via `replaceFeedbackStatus`. Gated by `feedback.any.update`.
- **`PATCH /:id`** — merge status fields via `updateFeedbackStatus`. Gated by `feedback.any.update`.
- **`DELETE /:id`** — remove entry via `deleteFeedback`. Gated by `feedback.any.delete`.

## Relationships

- **`src/modules/feedback/controllers/post-feedback-contact.ts`** — handler for the public `POST /contact` route.
- **`src/modules/feedback/controllers/get-feedback.ts`** — shared handler for both `POST /search` and `GET /`.
- **`src/modules/feedback/controllers/update-feedback-status.ts`** — exports `replaceFeedbackStatus` (PUT) and `updateFeedbackStatus` (PATCH).
- **`src/modules/feedback/controllers/delete-feedback.ts`** — handler for `DELETE /:id`.
- **`src/modules/feedback/rate-limits.ts`** — provides `contactLimiters`, applied before the contact-form handler.
- **`src/kernel/middlewares/authorizations.ts`** — provides `getAuth`, `isAuthOrCredential` (positional gate), and `requirePermission` (per-route key check).
- **`src/infrastructure/http/middlewares/cache.ts`** — provides `noStore` (POST responses) and `privateNoCache` (GET /).
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — provides `humanChallengeGate`, applied on the public contact route.
- **`src/infrastructure/http/middlewares/idempotency.ts`** — provides `idempotencyKey`, applied on the public contact route.
- **`src/modules/feedback/module.ts`** — consumer; mounts this `router` into the app.
- **`src/modules/feedback/tests/unit/routes.test.ts`** — unit tests for route definitions and middleware ordering.

## Notes

- **Positional auth boundary is the critical invariant.** The `router.use(getAuth, isAuthOrCredential)` line separates public from admin routes purely by its position. Appending a public route *after* it silently makes it admin-only, and moving it above the public route would break the contact form. The comment and `tests/cross-cutting/authenticated-controllers.test.ts` (cross-cutting, not in this file) are the safety nets.
- **`POST /search` is intentional.** It exists because the team decided against a GET with a body; it is mounted before any `/:id` GET route to avoid path-segment ambiguity.
- **Cache headers are route-specific, not global.** `noStore` on every POST response (RFC 9111 §3.5 — shared caches must not hold admin queue data); `privateNoCache` on `GET /` so the browser may cache locally but must revalidate.
- **`humanChallengeGate` is off by default** — it activates only when `NODE_ANTIBOT_PROVIDER` is set.
