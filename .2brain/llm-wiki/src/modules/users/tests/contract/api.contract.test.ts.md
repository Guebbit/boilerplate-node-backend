---
source: src/modules/users/tests/contract/api.contract.test.ts
sha256: ab33b04ee00e2cd3a2b81a92cc8c06159fd1b40d0fbc660868968e51a3682bfd
generated_at: 2026-11-14T22:32:59.567196+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the user-facing API surface (`GET /users`, `GET /users/{id}`, `GET /account`, `POST /account/signup`, `POST /users`, `PUT /users/{id}`). The primary guarantee is a **credential-leak guard**: because `openapi.yaml` declares `additionalProperties: false` on the `User` schema, any undeclared field (a plaintext password, an argon2 hash) causes a test failure even if no one wrote an explicit assertion for it. Secondary guarantees cover response shape, locale normalization, PII exclusion, domain-event emission, and error-status correctness.

## Key elements

- **`assertNoCredentials(payload)`** — serialises the full JSON body and asserts it contains neither the string `"password"` nor `"$argon2"`. Applied to every response that returns a user object.
- **`activeOf(id)` / `roleOf(id)`** — small async helpers that read the stored `active` flag and the tenant role directly from `userRepository` / the access service, used to assert side-effects of mutations.
- **`storePhone(userId, phone)`** — writes an encrypted phone number (via `encryptPii` + `phoneAad`) the way production does, so list-vs-detail PII tests exercise the real cipher path rather than the factory's plaintext.
- **`describe` blocks** — one per endpoint; each verifies status code, contract shape, and endpoint-specific invariants (e.g. `purchaseHeld` flag present, `purchaseHold` details absent from list but present on detail; `cache-control: no-store` on `/account`; 409 vs 422 on duplicate signup; 422 on `password`, `sendSetupEmail`, `verifiedAt`, `analyticsConsent`, raw `phone` in create body).
- **Audit-port mock** — `jest.mock` replaces the entire `@infrastructure/observability/audit` module with `auditPortMock()` because `jest.spyOn` cannot redefine the non-configurable getter on a CommonJS namespace import under SWC.
- **Domain-event wiring** — `markDomainEventsWired()`, `onDomainEvent(USER_SETUP_REQUESTED, …)`, and `settleOutboxNudges()` verify that admin-created accounts emit the setup-requested event and the outbox settles.

## Relationships

- **`tests/support/contract.ts`** — imported side-effect-only; installs the OpenAPI schema matcher that enforces `additionalProperties: false` on every response.
- **`src/modules/users/tests/factories.ts`** — provides `createUser`, `PLAIN_PASSWORD`, and the shared `userRepository` instance used for seeding and post-condition queries.
- **`src/modules/users/repository.ts`** — the repository used by the factories and by direct queries (`findById`, `findOne`, `updateMany`) to verify persisted state.
- **`src/modules/users/model.ts`** — `phoneAad` supplies the associated-data binding for PII encryption in `storePhone`.
- **`src/modules/users/events.ts`** — exports `USER_SETUP_REQUESTED`, the domain event the create-account path must emit.
- **`src/modules/access/index.ts`** — re-exports the access service used to verify tenant-role assignment after mutations.
- **`src/modules/access/services/index.ts`** — the concrete access service whose `rolesOf` method is queried to assert role state.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` scopes the role lookup to the correct tenant.
- **`src/kernel/config.ts`** — `reauthWindowSeconds` (imported, used in the reauth-window tests).
- **`src/kernel/events.ts`** — `markDomainEventsWired`, `onDomainEvent`, `resetDomainEvents` manage the in-memory event bus for assertions.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges` flushes pending outbox entries so async side-effects complete before assertions.
- **`src/infrastructure/observability/audit.ts`** — fully mocked via `jest.mock`; the real module is never invoked.
- **`src/infrastructure/security/pii-encryption.ts`** — `encryptPii` encrypts phone numbers for the list-vs-detail PII tests.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` pin the clock for time-sensitive assertions (purchase-hold expiry, reauth windows).
- **`tests/support/credentials.ts`** — `credentialHolding` helper for credential-related test setup.

## Notes

- The `?role=` filter on `GET /users` was intentionally **removed** from the API and is **not** tested here; the comment explains that role is now a membership fact requiring a two-step resolve the generic repository spec cannot express.
- `PUT /users/{id}` tests treat the body as the full replacement resource per RFC 9110 §9.3.4 — omitted optional fields are cleared, not preserved.
- `POST /users` (admin create) explicitly **rejects** `password` and `sendSetupEmail` in the body (422); the owner sets their own password via the setup email. This is a deliberate API contract, not an oversight.
- The audit mock uses `jest.requireActual` of `@tests/ports` to pull the mock factory — a workaround for the SWC + CJS namespace-getter issue, not a standard pattern.
- PII (phone) is stored encrypted in these tests to match production; the factory's plaintext path is never read back by the presenter, so an unencrypted value would cause a 500 on read.
