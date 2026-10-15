---
source: tests/unit/infrastructure/http/cookies.test.ts
sha256: 1fd364251fb1e034afec5beb5436bcc373eac91666293c332ba277bffd68f962
generated_at: 2026-10-15T13:10:46.600418+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/cookies.test.ts

## Purpose
Unit tests for the `cookieOf` helper, verifying that it correctly extracts a single named cookie from a request object and returns `undefined` when the cookie is absent.

## Key elements
- **`describe('cookieOf')`** — single test suite covering the one exported function.
- **`it('returns the named cookie')`** — asserts `cookieOf({ cookies: { jwt: 'abc', other: 'x' } }, 'jwt')` resolves to `'abc'`.
- **`it('returns undefined for a cookie that was never set')`** — asserts that requesting a key not present in the `cookies` map yields `undefined`.

## Relationships
- **`src/infrastructure/http/cookies.ts`** — the module under test; this file imports `cookieOf` via the `@infrastructure/http/cookies` alias and exercises its public contract.

## Notes
- The request fixture uses a flat `{ cookies: { … } }` shape; the function is expected to read from that `cookies` property rather than parsing a raw `Cookie` header string.
- No edge cases (empty string values, `null` cookies map, etc.) are covered here—add those if the implementation gains complexity.
