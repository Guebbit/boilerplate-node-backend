---
source: tests/unit/infrastructure/security/breached-passwords/index.test.ts
sha256: 75cc86be22b1ebe3ed0b81ce80e8a173edcabc2b294bb110a76f57975ac93af2
generated_at: 2026-09-23T20:26:28.685474+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/security/breached-passwords/index.test.ts

## Purpose

Unit tests for the two-tier breached-password check (bundled list + HIBP k-anonymity API) and the combined `assertPasswordNotBreached` guard. Validates correct routing between the two rungs, the HIBP request format, fail-open semantics, and the shape of the user-facing validation error.

## Key elements

- **`textResponse(body, ok)`** – Factory that returns a minimal `Response`-shaped object (`ok`, `status`, `text()`), used to mock `globalThis.fetch` without a real network call.
- **`IN_LIST_PASSWORD` / `NOT_IN_LIST_PASSWORD`** – Fixed fixtures: one guaranteed to be in the committed ~20 k-entry bundled list, one that is not.
- **`original` + `afterEach`** – Saves and restores `NODE_PASSWORD_BREACH_LIST` / `NODE_PASSWORD_BREACH_HIBP` env vars around every test (same pattern as `antibot-providers`).
- **`describe('isInBundledBreachList')`** – Two cases: hit and miss against the static list.
- **`describe('checkHibpRange')`** – Verifies only the 5-hex-char prefix is sent in the URL, parses a matching suffix line, and confirms fail-open on network errors and non-200 responses.
- **`describe('checkPasswordBreach')`** – Verifies short-circuit on rung 1, skip of rung 2 when disabled, and fall-through to rung 2.
- **`describe('assertPasswordNotBreached')`** – Confirms the returned error is a generic `VALIDATION_ERROR` on the `password` field without leaking which rung triggered it, and returns `[]` for an acceptable password.

## Relationships

- **`src/infrastructure/security/breached-passwords/index.ts`** – The sole SUT; this file imports `isInBundledBreachList`, `checkHibpRange`, `checkPasswordBreach`, and `assertPasswordNotBreached` from it.
- **`scripts/ops/refresh-breached-passwords.ts`** – Referenced in a comment as the source of the committed bundled list that `IN_LIST_PASSWORD` is expected to appear in.
- **`oauth-github.test.ts` / `oauth-google.test.ts`** – Cited in the module docstring as the origin of the `fetch`-mocking pattern reused here.

## Notes

- The HIBP check is intentionally **fail-open**: both a rejected `fetch` and a non-200 response resolve to `{ breached: false }`, so a HIBP outage never blocks a user from registering a valid password.
- `assertPasswordNotBreached` deliberately does **not** disclose which rung (bundled list vs. HIBP) produced the rejection—only a generic validation error on the `password` field.
- Env-var toggles (`NODE_PASSWORD_BREACH_LIST`, `NODE_PASSWORD_BREACH_HIBP`) gate each rung independently; tests set them per-case and rely on `afterEach` restoration.
