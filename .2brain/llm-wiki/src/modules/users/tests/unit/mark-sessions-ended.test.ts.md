---
source: src/modules/users/tests/unit/mark-sessions-ended.test.ts
sha256: 1898c90579805c090719d91dd9d6ac7a2b51db5b4b59577fb897035a3acdabfe
generated_at: 2026-10-15T12:16:24.798137+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/mark-sessions-ended.test.ts

## Purpose

Unit tests for the `markSessionsEnded` service function, verifying the single invariant that the `tokensValidAfter` epoch on a user document can only advance forward in time and is never pushed backward.

## Key elements

- **`holder`** — local helper that builds a minimal `UserDocument` stub with only `tokensValidAfter` populated (the sole field the function under test reads/writes).
- **`describe('markSessionsEnded')`** — contains three cases:
  - sets the epoch when the account has none (`undefined` → a date),
  - moves an older epoch forward,
  - leaves a later epoch untouched.

## Relationships

- **`src/modules/users/services/credentials.ts`** — provides the `markSessionsEnded` function under test.
- **`src/modules/users/model.ts`** — supplies the `UserDocument` type (type-only import) that shapes the stub objects.
- **`tests/support/stub.ts`** — provides `asStub`, used by `holder` to create a loosely-typed partial object.

## Notes

- `markSessionsEnded` mutates the document **in place**; there is no return value to capture.
- The helper comment explicitly states "only the epoch set, which is all the function reads," signaling the function's contract is intentionally narrow (one field in, one field out) and that no other `UserDocument` property is consulted.
