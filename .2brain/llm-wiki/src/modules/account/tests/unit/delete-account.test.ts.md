---
source: src/modules/account/tests/unit/delete-account.test.ts
sha256: dde03aac49a5b8945e2cc1a89b71fbf610c6976335ee1b42fe2fdf48f18d7561
generated_at: 2026-09-23T18:15:23.030276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/delete-account.test.ts

## Purpose

Unit tests for the two-step account-deletion controllers (`deleteAccountRequest`, `deleteAccountConfirm`) at the wiring level. All collaborators are mocked; the file's core job is to **pin the enumeration-prevention invariant** (unknown email → 200, spent/unknown/expired token → identical 422) and to verify the controller's error-routing and metric-emission paths without exercising mail or database logic.

## Key elements

- **`describe('DELETE /account — deleteAccountRequest')`** — three cases:
  - Happy path: user found → `requestAccountDeletion` called, `successResponse` sent, `authAccountDeleteTotal.inc({status:'success'})` emitted.
  - Enumeration prevention: `findByEmail` returns `undefined` → `requestAccountDeletion` never called, but `successResponse` still sent (200), metric tagged `failure`.
  - Service throw: `rejectResponse(res, 500)` — the `errors` array is never passed explicitly (defaults to `[]` inside `rejectResponse`).
- **`describe('DELETE /account/delete-confirm — deleteAccountConfirm')`** — four cases:
  - Valid token: `findLiveToken` → `spendLiveToken` → `removeOwnAccount` chain, 200.
  - Already-spent token: `spendLiveToken` returns `false` → `removeOwnAccount` not called, `rejectResponse(res, 422, …)`.
  - Not-live token: `findLiveToken` returns `undefined` → same 422 refusal (deliberately indistinguishable from the spent case).
  - Unrecognized error: `rejectResponse(res, 500)`.
- **Mocks** — `userService.findByEmail`, `accountService.{findLiveToken, spendLiveToken, requestAccountDeletion, removeOwnAccount}`, `successResponse`/`rejectResponse`, `authAccountDeleteTotal.inc`, and `@modules/account/session/cookies` helpers.
- **`makeResponse()`** — minimal Express-like `res` stub (`{ locals: {} }`) passed to both controllers.

## Relationships

- **`delete-account-request.ts` / `delete-account-confirm.ts`** — the two controller functions under test; this file is their wiring-level spec.
- **`@modules/account/services/index.ts`** — `accountService` is fully mocked; the test asserts *which* service methods the controller invokes and in what order, not their internal behavior.
- **`@modules/users/index.ts` → `service.ts`** — `userService.findByEmail` is mocked; the test only cares that the controller calls it with the auth-context email.
- **`@infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` are mocked; the test asserts the controller routes through them (and with which status code) rather than calling `res.json` / `res.status` directly.
- **`@modules/account/metrics.ts`** — `authAccountDeleteTotal.inc` is mocked; the test verifies the controller emits the counter with the correct `status` label.

## Notes

- **No mail assertions here on purpose.** Both the request-link email and the goodbye email are owned by the service layer (`requestAccountDeletion`, `removeOwnAccount`) and are asserted in `emails.test.ts` / `self-service.test.ts`. This file deliberately stops at the controller boundary.
- **One 422 path, not three.** `findLiveToken` collapses "expired", "never existed", and "already spent" into a single `undefined` / `false` refusal, so the controller (and this test) see exactly one failure branch. The distinction lives in `self-service.test.ts` against a real document.
- **`errors` param is implicit.** `rejectResponse` defaults its `errors` argument to `[]`; callers (including these controllers) never pass it, so the test asserts only `(res, status)`.
- **Cookie helpers mocked via a relative path** (`@modules/account/session/cookies`) because the controller imports them directly; the mock mirrors the pattern noted in `token-cleanup.test.ts`.
