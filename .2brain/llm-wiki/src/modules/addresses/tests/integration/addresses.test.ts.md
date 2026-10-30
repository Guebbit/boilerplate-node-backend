---
source: src/modules/addresses/tests/integration/addresses.test.ts
sha256: 8cdccc86a83536ad87e99305bc5011e005af4016527592b367e106e81c4464b2
generated_at: 2026-10-29T03:10:28.556866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/addresses.test.ts

## Purpose

Integration test suite for the address-book module. It exercises `addressService` end-to-end against a real (test) database to verify three cross-cutting invariants: exactly one default per non-empty book, per-user ownership (foreign entries answer 404), and the enforceable entry cap (409 when exceeded). It also confirms PII fields are encrypted at rest and round-trip correctly through the repository.

## Key elements

- **`labelsOf(userId)`** — helper that lists a user's addresses and returns an array of labels in stored order.
- **`withCap(body)`** — wraps an async block in `withEnvironmentOverrides({ NODE_ADDRESS_BOOK_MAX: '3' })` so cap tests run with a small, deterministic limit.
- **`defaults(userId)`** — helper that returns only the addresses flagged `default: true` for the given user.
- **`describe('the one-default invariant')`** — seven cases covering first-entry auto-default, explicit `setDefault` demoting the prior holder, idempotent re-set, 404 for a foreign entry, `default: true` on create demoting in the same write, ordinary edit not touching default, and removal promoting the oldest remaining entry.
- **`describe('adding an entry that claims the default')`** — verifies demotion on create, that a `$`-prefixed label is stored as plain text (not interpreted as a pipeline field path), and that `createdAt`/`updatedAt` are stamped on first entry.
- **`describe('the address-book cap')`** — 409 + `ADDRESS_BOOK_LIMIT_REACHED` when exceeding the cap, re-admission after removal, and two concurrency tests (12 parallel adds → exactly 3 succeed; 6 parallel default-claims → exactly 1 default survives).
- **`describe('ownership')`** — a stranger's `update`/`remove` on someone else's entry returns 404 and leaves the owner's data untouched.
- **`describe('PII at rest')`** — reads the raw `addressBookModel` document (bypassing the repository's decrypt) to assert fields are in the `v<N>:...` versioned-secret wire format; round-trips through `addressService.list`; and verifies the AAD (entry id) prevents cross-entry/cross-field ciphertext reuse.

## Relationships

- **`src/modules/addresses/service.ts`** — the primary subject under test; all CRUD and `setDefault` calls go through `addressService`.
- **`src/modules/addresses/model.ts`** — imported as `addressBookModel`; used directly in the PII-at-rest tests to read the raw document and bypass the repository's decryption layer.
- **`src/modules/addresses/tests/integration/fixtures.ts`** — provides the `HOME` and `OFFICE` fixture objects used as canonical create payloads.
- **`src/modules/users/tests/factories.ts`** — `createUser` factory; every test creates a fresh user (or two, for ownership cases).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module top-level to initialise the test database before any test runs.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` is used by `withCap` to temporarily lower the book cap to 3.
- **`tests/support/response.ts`** — `asReject` narrows a failed service response to its error shape (status, errors array) for assertion.

## Notes

- The file deliberately imports `../../service` and `../../model` (relative paths) rather than the module barrel (`index.ts`), per the project's barrel-import rule that applies to tests as well.
- The PII-at-rest test reads via `addressBookModel.findOne(...).lean()` specifically to simulate a raw disk/backup read; it intentionally bypasses the repository's decrypt step.
- The `$`-prefixed label test documents that the update pipeline wraps user text in `$literal`, so a label like `$items` is stored verbatim and not interpreted as a Mongoose aggregation field path.
- Cap-enforcement tests rely on the cap being checked in the update *filter* (not just application logic), which is why the concurrent-burst test expects exactly `cap` successes even under `Promise.all` fan-out.
- `setupTestDb()` runs once at module load; there is no per-test database reset visible in this file—each test uses a freshly created user to isolate state.
