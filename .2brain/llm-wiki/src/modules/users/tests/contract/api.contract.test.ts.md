---
source: src/modules/users/tests/contract/api.contract.test.ts
sha256: 2e4298c7a1b1b77474593587a50b441b036d08de7ab313aaa9d5cb427b8856bb
generated_at: 2026-11-08T08:53:03.229913+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/users` and `/account` endpoints that act as a **credential-leak guard**: because the OpenAPI `User` schema declares `additionalProperties: false`, any undeclared field (a raw password, an argon2 hash) in a response fails here regardless of whether a developer thought to name it. The file also validates request-body strictness (422 on undeclared fields), PUT full-replacement semantics (RFC 9110 §9.3.4), and cache-control headers.

## Key elements

- **`assertNoCredentials(payload)`** — serialises the response body to JSON and asserts the strings `'password'` and `'$argon2'` do not appear anywhere. Used in every GET/POST/PUT assertion.
- **`storePhone(userId, phone)`** — writes an encrypted phone via `userRepository.updateMany`, using `encryptPii(phone, phoneAad(userId))`. Needed because the factory stores plaintext but production encrypts under the account's AAD binding.
- **`activeOf(id)`** — reads the stored `active` flag through `userRepository.findById`.
- **`describe('GET /users')`** — 200 + no-credentials + every item carries a `role` (guards a regression where the list path's `toJSON` omitted the role that `GET /users/:id` resolves from the membership store).
- **`describe('GET /users/{id}')`** — 200 + no-credentials.
- **`describe('GET /account')`** — 200 + no-credentials + `cache-control: no-store` (a profile is the caller's identity; browsers must not cache it).
- **`describe('POST /account/signup')`** — 201 + no-credentials; duplicate email returns **409** (well-formed request, conflicting resource).
- **`describe('POST /users')`** — admin create: rejects `null` `imageUrl`, rejects `password`/`sendSetupEmail`/`verifiedAt`/`analyticsConsent`/`phone` with 422 and no row created; on success emits `USER_SETUP_REQUESTED` (verified via `onDomainEvent` + `settleOutboxNudges`).
- **`describe('PUT /users/{id}')`** — full-replacement semantics: omitted optional fields are cleared (`phone` gone), `imageUrl` survives (owned by the upload flow); missing `username` or `role` → 422; `email`/`password` in body → 422 with stored values unchanged.

## Relationships

- **`tests/support/contract.ts`** — imported for side-effect; registers the global OpenAPI contract matcher that every `expect(response.body)` implicitly invokes.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once before the suite to reset the test database.
- **`tests/support/http.ts`** — provides `api()` (request helper), `authenticateAs`, `authenticateAsRole` for building authenticated requests.
- **`src/modules/users/tests/factories.ts`** — `createUser` (seed a user), `PLAIN_PASSWORD` (known constant), `userRepository` (direct DB access for assertions).
- **`src/infrastructure/observability/audit.ts`** — **replaced** (not spied) via `jest.mock` with `auditPortMock()` from `tests/support/ports.ts`, because `jest.spyOn` cannot redefine the non-configurable getter on a CJS namespace import under SWC.
- **`tests/support/ports.ts`** — `auditPortMock()` and `observePort` (the latter likely used in the truncated portion for outbox/audit observation).
- **`src/kernel/events.ts`** — `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` to capture and reset the `USER_SETUP_REQUESTED` domain event.
- **`src/modules/users/events.ts`** — source of the `USER_SETUP_REQUESTED` event constant.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes queued outbox messages so the event is observable.
- **`src/infrastructure/security/pii-encryption.ts`** — `encryptPii` used by `storePhone`.
- **`src/modules/users/model.ts`** — `phoneAad` (the AAD binding string for PII encryption).
- **`src/kernel/config.ts`** — `reauthWindowSeconds` (used in the truncated reauth-related tests).
- **`tests/support/credentials.ts`** — `credentialHolding` (used in the truncated credential-guard tests).
- **`tests/support/clock.ts`** — `freezeDate`, `advanceDate` for time-dependent assertions in the truncated section.
- **`src/modules/users/repository.ts`** — accessed indirectly through `userRepository` from the factory for post-condition checks.

## Notes

- **Audit port is replaced, not spied.** `jest.spyOn` fails on the non-configurable getter that a CommonJS namespace import exposes under SWC; the file uses `jest.mock` + `requireActual('@tests/ports').auditPortMock()` instead.
- **`?role=` filter is intentionally absent.** `role` is a membership fact, not a searchable document column; no current caller needs it on `GET /users`, so the test is deliberately omitted.
- **PUT ≠ PATCH.** The body is the complete new resource (RFC 9110 §9.3.4); every omitted *optional* field is cleared. `imageUrl` is the sole exception because it is managed by the upload flow, not this endpoint.
- **`assertNoCredentials` is a substring scan, not a key check.** It catches both the literal key name and any argon2 hash prefix (`$argon2`), so it guards against the value leaking even if the key were renamed.
- **Factory writes plaintext phone.** `storePhone` exists to mimic the production encryption path; any test that reads `phone` back must go through this helper, not the raw factory value.
- **`POST /users` is explicitly *not* a password-set path.** Those are covered in `tests/contract/password-set-paths.test.ts`.
