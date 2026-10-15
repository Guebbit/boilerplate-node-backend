---
source: tests/unit/infrastructure/security/breached-passwords/index.test.ts
sha256: 0fd8ccf8736544d1338078bfae06701062b8122a14ee67f10da32a45983d42da
generated_at: 2026-10-15T13:19:53.385101+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/breached-passwords/index.test.ts

## Purpose

Unit tests for the breached-password security module, verifying both lookup rungs (the bundled list and the HIBP k-anonymity API), their combined orchestration in `checkPasswordBreach`, and the user-facing `assertPasswordNotBreached` validation wrapper. All network I/O is faked via a global `fetch` spy.

## Key elements

- **`IN_LIST_PASSWORD` / `NOT_IN_LIST_PASSWORD`** — two fixed passwords; the first is guaranteed to be in the committed ~20k-entry bundled list, the second is composition-valid but absent.
- **`textResponse(body, ok)`** — helper that builds a real `Response` (needed because the implementation reads the body through a capped stream). `ok = false` produces a 503 for non-200 cases.
- **`describe('isInBundledBreachList')`** — asserts hit and miss against the static list.
- **`describe('checkHibpRange')`** — verifies:
  - Only the first 5 hex chars of the SHA-1 are sent in the URL (k-anonymity).
  - A matching suffix in the response yields `{ breached: true, count }`.
  - `redirect: 'error'` is always passed.
  - Fail-open behaviour: oversized body (> 1 MiB), network rejection, and non-200 status all resolve to `{ breached: false }`.
- **`describe('checkPasswordBreach')`** — confirms rung-1 short-circuit (no `fetch` call), HIBP-disabled skip, and fall-through to rung 2 when rung 1 misses.
- **`describe('assertPasswordNotBreached')`** — checks the validation-error shape (`code: 'VALIDATION_ERROR'`, `details.field: 'password'`) without leaking which rung matched; also the clean `[]` path.
- **`afterEach`** — calls `jest.restoreAllMocks()` to reset the `fetch` spy and any `setEnvironment` switches.

## Relationships

- **`src/infrastructure/security/breached-passwords/index.ts`** — the module under test; all four exported functions (`isInBundledBreachList`, `checkHibpRange`, `checkPasswordBreach`, `assertPasswordNotBreached`) are imported and exercised here.
- **`tests/support/environment.ts`** — provides `setEnvironment`, used to toggle the `NODE_PASSWORD_BREACH_LIST` and `NODE_PASSWORD_BREACH_HIBP` switches per test case.

## Notes

- The `fetch` spy replaces `globalThis.fetch` directly (not a module mock), matching the pattern used in the OAuth provider tests.
- `textResponse` must produce a genuine `Response` object (not a plain `{ body }` stub) because `checkHibpRange` consumes the body as a byte-capped stream; a fake without a real stream would bypass the cap logic under test.
- The fail-open contract (network down, non-200, oversized) is a deliberate product decision — the tests pin it so a future refactor that makes HIBP failures hard-error would be caught.
- `assertPasswordNotBreached` intentionally omits the rung that matched from its error message; the test asserts only the generic shape to lock that behaviour in.
