---
source: tests/unit/kernel/authentication.test.ts
sha256: 8be3412ba900efd2ed245c18ff14ca8b3c896e76a2b6fcb8c3e663dcaa86135d
generated_at: 2026-11-08T10:26:20.722841+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/kernel/authentication.test.ts

## Purpose

Exercises the "no auth resolver registered" code path in `src/kernel/authentication.ts`. It exists as a separate test file (rather than living in `authorizations.test.ts`) so that the module is imported **without** ever calling `registerAuthResolver`, letting Jest's per-file module registry keep the internal `resolver` unset and reach the "no `account` module in this build" branch.

## Key elements

- **`describe` block** — two `it` cases asserting the unregistered-resolver behavior:
  - `resolveBearer` / `resolveCookie` with an arbitrary token resolve to `{ miss: 'malformed' }` (a guest result, not a thrown error).
  - `cookieAuthenticatesRequests()` returns `false` (a plain answer, not an exception).
- **Imports** — `resolveBearer`, `resolveCookie`, `cookieAuthenticatesRequests` from `@kernel/authentication`.

## Relationships

- **`src/kernel/authentication.ts`** — the module under test. This file deliberately imports it *before* any call to `registerAuthResolver`, which is the entire reason for its existence.
- **`tests/unit/kernel/authorizations.test.ts`** — the sibling test file that *does* register a resolver at module load. The two files are mutually exclusive by design; merging them would break the "resolver unset" precondition.

## Notes

- **Do not add a `registerAuthResolver` call or import side-effect here.** The whole point is that `resolver` stays `undefined` for the duration of this file's module registry.
- The test uses an intentionally malformed token string (`'any.token.here'`) to confirm the *malformed* miss path specifically, not a well-formed-but-unknown token path.
- `cookieAuthenticatesRequests` is asserted synchronously (no `await`), matching its synchronous return in the source.
