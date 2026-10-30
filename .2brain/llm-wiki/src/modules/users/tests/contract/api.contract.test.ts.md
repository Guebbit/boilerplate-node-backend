---
source: src/modules/users/tests/contract/api.contract.test.ts
sha256: ed274080d07d9539b7e888775c3a56b4270c93d1b2a80efadcf34814ad2a77ce
generated_at: 2026-10-29T06:19:25.384598+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/users` and `/account` HTTP surface. Their primary job is the **credential-leak guard**: because `openapi.yaml` declares `additionalProperties: false` on the `User` schema, any undeclared field (a plaintext password, an argon2 hash, a raw phone) that sneaks into a response body is caught here regardless of whether anyone thought to name it explicitly. Secondary duties include asserting PUT full-replace semantics, the `no-store` cache header on `/account`, and that admin-created accounts never accept a `password` or `sendSetupEmail` field.

## Key elements

- **`assertNoCredentials(payload)`** — serialises a response body and asserts it contains neither the string `"password"` nor `"$argon2"`. Applied to every response in this file.
- **`storePhone(userId, phone)`** — writes a phone the way production does: `encryptPii(phone, phoneAad(userId))` via `userRepository.updateMany`. Used to set up encrypted phone state before PUT tests.
- **`activeOf(id)`** — small helper to read the stored `active` flag for a user.
- **`jest.mock('@infrastructure/observability/audit', …)`** — *replaces* the audit port with a mock (via `auditPortMock()` in `tests/support/ports.ts`) rather than spying, because `jest.spyOn` cannot redefine the non-configurable getter a CommonJS namespace import exposes under SWC.
- **`describe('GET /users')`** — 200 + no-credentials + each item carries a `role` (regression: list endpoint previously lost `role` because it went through the document's `toJSON` transform instead of the membership store).
- **`describe('GET /users/{id}')`** — 200 + no-credentials.
- **`describe('GET /account')`** — 200 + no-credentials + `cache-control: no-store`.
- **`describe('POST /account/signup')`** — 201 happy path; **409** (not 422) for a duplicate email.
- **`describe('POST /users')`** — admin-created account: rejects `null` `imageUrl` (422), rejects `password` / `sendSetupEmail` in the body (422, no user created), rejects undeclared fields (`verifiedAt`, `analyticsConsent`, `phone` — 422, no user created). Happy path fires `USER_SETUP_REQUESTED` domain event, settles outbox nudge.
- **`describe('PUT /users/{id}')`** — full-replace semantics (RFC 9110 §9.3.4): omitted optionals are cleared; `imageUrl` is exempt (belongs to an upload path). Missing required identity fields → 422. `email` and `password` are undeclared → 422, stored values unchanged.

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect setup (likely registers OpenAPI-driven assertions before each test).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database at module top.
- **`tests/support/http.ts`** — provides `api()` (supertest-style client), `authenticateAs`, `authenticateAsRole`.
- **`modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` build test fixtures; re-exports `userRepository`.
- **`modules/users/repository.ts`** — `userRepository` used directly for post-condition checks (e.g. verifying no row was created, reading `active` flag) and for `storePhone`.
- **`modules/users/model.ts`** — `phoneAad(userId)` supplies the AAD string for PII encryption.
- **`infrastructure/security/pii-encryption.ts`** — `encryptPii` used in `storePhone` to write phone the way production does.
- **`kernel/events.ts`** — `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` wire and assert the `USER_SETUP_REQUESTED` event.
- **`kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox entries after the signup/setup flow.
- **`kernel/config.ts`** — `reauthWindowSeconds` imported (used in truncated portion for reauth-window assertions).
- **`infrastructure/observability/audit.ts`** — fully **mocked/replaced** (not spied) so no audit side-effects leak into assertions.
- **`tests/support/ports.ts`** — `observePort` and `auditPortMock` used to construct the audit port replacement.
- **`tests/support/credentials.ts`** — `credentialHolding` (used in truncated portion).
- **`tests/support/clock.ts`** — `freezeDate`, `advanceDate` imported for time-sensitive assertions (used in truncated portion).
- **`modules/users/events.ts`** — `USER_SETUP_REQUESTED` constant.

## Notes

- The `?role=` query filter on `GET /users` is **deliberately absent**: `role` is a membership fact, not a document column, and the generic `exact` spec in `createRepository` cannot express the required two-step resolve. No caller needs it today.
- PUT is **full-replace**, not merge. Omitting an optional field clears it; omitting a *required* field (`username`, `role`) is a 422. `imageUrl` is the one field exempt from replace because it is managed by the upload flow.
- Duplicate-email signup returns **409**, not 422: the request is well-formed; the conflict is semantic.
- The `storePhone` helper exists because the test factory writes plaintext phone, which no read path would ever decode. Production stores it encrypted under the account's AAD.
- The audit port must be **replaced**, not spied on — a SWC/CommonJS quirk makes the namespace getter non-configurable, so `jest.spyOn` throws.
- `POST /users` (admin create) must never accept a `password` or `sendSetupEmail` field. The owner sets their own password via the setup email. This is cross-checked in `tests/contract/password-set-paths.test.ts`.
