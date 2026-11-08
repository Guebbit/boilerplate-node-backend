---
source: tests/unit/infrastructure/http/cookies.test.ts
sha256: 1fd364251fb1e034afec5beb5436bcc373eac91666293c332ba277bffd68f962
generated_at: 2026-11-08T10:12:21.679311+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/cookies.test.ts

## Purpose

Unit tests for the `cookieOf` utility, verifying that it extracts a single named cookie value from a request-like object and returns `undefined` when that cookie is absent.

## Key elements

- **`describe('cookieOf', …)`** — the sole test suite in the file.
  - **`'returns the named cookie'`** — asserts `cookieOf({ cookies: { jwt: 'abc', … } }, 'jwt')` yields `'abc'`.
  - **`'returns undefined for a cookie that was never set'`** — asserts the same call with a missing key yields `undefined`.

## Relationships

- **Imports `cookieOf` from `@infrastructure/http/cookies`** — the function under test lives in `src/infrastructure/http/cookies.ts`; this file exercises only that single export.

## Notes

- The test input is a plain object shaped `{ cookies: Record<string, string> }`; the function is not given a real HTTP request object. If the production signature changes to accept a full request, these tests will need updating.
- Only the "present" and "absent" paths are covered; edge cases (empty string value, non-string values) are not exercised here.
