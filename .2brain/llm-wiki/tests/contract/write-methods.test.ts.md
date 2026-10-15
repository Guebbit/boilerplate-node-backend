---
source: tests/contract/write-methods.test.ts
sha256: 7a535458637d5c7f9c473f76d5904aa76f5d7e9a1b0a6feda907c24bb99752ca
generated_at: 2026-10-15T12:34:28.802680+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/write-methods.test.ts

## Purpose

Cross-module contract tests for the write-method rules documented in `docs/api/write-methods.md`. Unlike module-specific tests, this file pins HTTP-level guarantees that must hold for *every* write endpoint: empty-string rejection, media-type enforcement, idempotency replay, `Location` on 201, and RFC 9110 conditional writes.

## Key elements

- **`WriteCase`** — `readonly [method, url, body]` tuple type used to tabulate endpoint cases.
- **`EMPTY_STRING_CASES`** — 17 `[method, url, body]` entries covering every optional free-text field declared `minLength: 1`. Each body is otherwise valid, so `''` is the sole trigger for the expected 422.
- **`sendKeyedContact`** — helper that POSTs `/feedback/contact` with a fixed `Idempotency-Key`; reused to assert replay behaviour without re-spelling the request.
- **`describe` blocks** (top-level):
  - *an empty string is never a stored value* — `it.each` over `EMPTY_STRING_CASES`, asserts 422.
  - *the body media type* — PATCH with undeclared type → 415 + no mutation; PATCH as `application/merge-patch+json` → 200; PUT with merge-patch → 415.
  - *stock writes replay under an Idempotency-Key* — retries receipts/adjustments with same key, asserts single stock delta and `idempotent-replay: true`.
  - *a 201 names the new resource in Location* — verifies `Location` header for user, contact, subscription, and signup creations; also replays under idempotency key.
  - *conditional writes (RFC 9110 §13.1.1)* — stale `If-Match` → 412 with `PRECONDITION_FAILED`; valid `If-Match` → 200 + new `ETag`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`); installs shared response assertions (e.g. ETag presence checks) used implicitly by the conditional-writes tests. |
| `tests/support/http.ts` | Source of `api`, `authenticateAs`, `authenticateAsRole` — every HTTP call goes through these. |
| `tests/support/ids.ts` | Supplies `MISSING_ID`, used in URLs to guarantee the resource does not exist (rejection must happen at validation, not lookup). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` invoked at module scope to reset the database before any test runs. |
| `tests/support/shopper-routes.ts` | `roleReaching({ path })` resolves the minimum role that can hit a given URL, used to authenticate for the empty-string cases. |
| `src/modules/products/tests/factories.ts` | `createProduct` builds a real product row for idempotency and conditional-write tests that require an existing resource. |
| `src/modules/users/tests/factories.ts` | `PLAIN_PASSWORD` constant used in the signup Location test. |

## Notes

- **Side-effect import matters:** `import '@tests/contract'` has no named bindings; removing it silently disables shared response assertions (the file's own comment in the conditional-writes block calls this out).
- **`MISSING_ID` is intentional, not a bug:** the 422/415 checks must fire during body validation *before* any row lookup, so the resource need not exist.
- **Bug W8 callout:** the media-type section documents a historical defect where a non-JSON PATCH body parsed as `{}` and was silently accepted by all-optional schemas. The 415 assertion pins the regression.
- **Cross-module by design:** the file header states that rules belonging to a single module's write path live in that module's own tests; this file only holds the universal invariants.
