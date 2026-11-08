---
source: tests/unit/infrastructure/security/breached-passwords/index.test.ts
sha256: 0fd8ccf8736544d1338078bfae06701062b8122a14ee67f10da32a45983d42da
generated_at: 2026-11-08T10:24:25.032487+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/breached-passwords/index.test.ts

## Purpose

Unit tests for the breached-password security module. Covers the two detection rungs (bundled list and HIBP k-anonymity lookup), their composition in `checkPasswordBreach`, and the user-facing `assertPasswordNotBreached` wrapper. `fetch` is faked throughout, mirroring the pattern used by the OAuth provider tests.

## Key elements

- **`IN_LIST_PASSWORD` / `NOT_IN_LIST_PASSWORD`** – Fixed fixtures: one confirmed in the committed ~20 k-entry list, one that is composition-valid but absent.
- **`textResponse(body, ok?)`** – Returns a real `Response` (status 200 or 503) so the implementation's stream-with-byte-cap read path is exercised.
- **`describe('isInBundledBreachList')`** – Asserts hit/miss against the bundled list.
- **`describe('checkHibpRange')`** – Verifies k-anonymity (only 5 hex chars sent), suffix-match detection with count, `redirect: 'error'`, fail-open on oversized body (>1 MiB), fail-open on network rejection, and fail-open on non-200.
- **`describe('checkPasswordBreach')`** – Toggles `NODE_PASSWORD_BREACH_LIST` / `NODE_PASSWORD_BREACH_HIBP` via `setEnvironment`; confirms rung-1 short-circuit skips `fetch`, HIBP-off skips rung 2, and the fall-through path.
- **`describe('assertPasswordNotBreached')`** – Checks the returned `VALIDATION_ERROR` shape and that the message does not reveal which rung triggered.
- **`afterEach`** – `jest.restoreAllMocks()` (same pattern as `antibot-providers`).

## Relationships

- **`src/infrastructure/security/breached-passwords/index.ts`** – The module under test; this file imports `isInBundledBreachList`, `checkHibpRange`, `checkPasswordBreach`, and `assertPasswordNotBreached` from it.
- **`tests/support/environment.ts`** – Provides `setEnvironment`, used to set `NODE_PASSWORD_BREACH_LIST` and `NODE_PASSWORD_BREACH_HIBP` before each integration-level case.

## Notes

- `fetch` is spied via `jest.spyOn(globalThis, 'fetch')` and the mock returns a **real** `Response` object, not a plain object—this matters because the implementation reads the body as a stream with a byte cap.
- All HIBP failure modes (network error, non-200, oversized body) intentionally **fail open** (`breached: false`); the tests pin this contract.
- The `assertPasswordNotBreached` test uses `expect.any(String)` for `message` specifically to assert the error does **not** name the rung, keeping the failure opaque to the caller.
