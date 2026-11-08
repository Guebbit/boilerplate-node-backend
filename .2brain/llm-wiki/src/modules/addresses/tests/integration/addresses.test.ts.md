---
source: src/modules/addresses/tests/integration/addresses.test.ts
sha256: 8cdccc86a83536ad87e99305bc5011e005af4016527592b367e106e81c4464b2
generated_at: 2026-11-08T04:57:23.968317+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/addresses.test.ts

## Purpose

Integration tests for the address-book service. They verify three core invariants end-to-end against a real database: a non-empty book always holds exactly one default, foreign entries are indistinguishable from invented ones (404), and the book cap is enforced even under concurrent writes. A secondary block confirms PII fields are stored encrypted (not plaintext) yet round-trip correctly through the repository.

## Key elements

- **`setupTestDb()`** — called at module level to create/isolate the test database before any `describe` runs.
- **`labelsOf(userId)`** — helper that lists the caller's book and maps entries to their labels.
- **`withCap(body)`** — wraps a test body with `NODE_ADDRESS_BOOK_MAX = '3'` via `withEnvironmentOverrides`, so cap tests never need many rows.
- **`defaults(userId)`** — helper that filters the caller's book to entries where `default` is `true`.
- **`describe('the one-default invariant')`** — seven cases covering: first-entry auto-default, explicit reassignment, idempotent re-set, foreign 404, default-on-create demotion, ordinary-edit neutrality, and removal promotion.
- **`describe('adding an entry that claims the default')`** — covers demotion-in-same-write, `$literal` escaping of `$`-prefixed user text, and timestamp stamping on first entry.
- **`describe('the address-book cap')`** — 409 + `ADDRESS_BOOK_LIMIT_REACHED` on overflow, slot freed after removal, and two concurrency-burst cases (12 parallel adds → exactly 3 succeed; 6 parallel default-claims → still one default).
- **`describe('ownership')`** — stranger's `update`/`remove` on a foreign entry both return 404 and leave the owner's data untouched.
- **`describe('PII at rest')`** — raw `addressBookModel` read confirms fields are ciphertext (matching `^v\d+(?::[\da-f]+){3}$`), repository read returns original plaintext, and AAD binding prevents cross-entry/cross-field ciphertext replay.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/addresses/service.ts` | The system under test; all service methods (`create`, `list`, `update`, `remove`, `setDefault`) are exercised here. |
| `src/modules/addresses/model.ts` | Imported as `addressBookModel`; used in PII tests for raw `.lean()` reads that bypass the repository's decrypt, simulating a stolen-disk scenario. |
| `src/modules/addresses/tests/integration/fixtures.ts` | Provides the `HOME` and `OFFICE` address fixtures used throughout. |
| `src/modules/users/tests/factories.ts` | Provides `createUser` to mint isolated test users (with distinct emails/usernames for ownership cases). |
| `tests/support/environment.ts` | Provides `withEnvironmentOverrides`, used by `withCap` to set the book-size limit. |
| `tests/support/response.ts` | Provides `asReject` to assert on the typed rejection shape (status, errors array). |
| `tests/support/setup-test-db.ts` | Provides `setupTestDb`, called once at the top of the module to prepare the test database. |

## Notes

- **Barrel bypass:** The file imports `../../service` and `../../model` directly rather than the module's `index.ts` barrel. A project rule (CLAUDE.md) forbids a module's own tests from re-exporting through its barrel; this is called out in a comment above the imports.
- **PII raw-read pattern:** The encryption assertions deliberately use `addressBookModel.findOne(...).lean()` to skip the repository's built-in decryption. The expected ciphertext format is the `versioned-secret` wire format (`v1:…`), not an ad-hoc scheme.
- **Cap under concurrency:** The cap is enforced inside the MongoDB update filter (atomic), so the 12-way `Promise.all` burst test is meaningful without extra locking.
- **`$`-prefix guard:** One test pins down that a label like `$items` is stored as literal text because the service wraps user-provided strings in `$literal` before they reach Mongo update pipelines.
