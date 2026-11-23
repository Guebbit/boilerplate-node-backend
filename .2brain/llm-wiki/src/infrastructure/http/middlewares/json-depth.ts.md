---
source: src/infrastructure/http/middlewares/json-depth.ts
source_sha256: a964e1eb42315566426a1c2aa72365f33268462de2144753d53138657e44d852
context_sha256: 5eb5e99247874f9b776970e100338c4c4e2ff2313bcef0a6f06e363f42147cd7
generated_at: 2026-11-22T02:50:18.525554+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/http/middlewares/json-depth.ts

## Purpose
Guards against deeply nested JSON request bodies. The JSON body parser only caps bytes, so a small body like `[[[…]]]` can be tens of thousands of levels deep and parse fine, then crash the first recursive walker (idempotency fingerprint, cache key, Zod schema) with a `RangeError` and a repeatable 500. This middleware sits right after the parser and returns a 400 for any body nested deeper than `MAX_JSON_DEPTH`, so every downstream walker is protected.

## Key elements
- `MAX_JSON_DEPTH` (32): the deepest nesting allowed for a request body.
- `JSON_BODY_TYPES`: `application/json` and `application/merge-patch+json` (RFC 7396, for PATCH). These are the media types the JSON body parser handles, and the only ones this guard checks.
- `exceedsDepth(root, limit)`: returns whether a parsed JSON value nests objects or arrays deeper than `limit`. The root container is depth 1. It is iterative, using an explicit stack, because a recursive check would throw the same `RangeError` it exists to prevent.
- `limitJsonDepth(request, response, next)`: the Express middleware. If `request.is(JSON_BODY_TYPES)` and the body exceeds the limit, it responds with 400 through `rejectResponse`. Otherwise it calls `next()`.

## Relationships
- `src/app/security.ts`: mounts the JSON body parser using the same `JSON_BODY_TYPES` list (per the doc comment), so the guard and the parser agree on which bodies are JSON.
- `src/infrastructure/http/response.ts`: provides `rejectResponse`, used to send the 400.
- `src/infrastructure/i18n/index.ts`: provides `t`, used for the bad-request error message.
- `src/infrastructure/i18n/context.ts` and `src/infrastructure/http/middlewares/json-object.ts`: listed as graph neighbors, but this file shows no direct interaction with either.
- `tests/unit/infrastructure/http/middlewares/json-depth.test.ts`: the unit test for this module.
- Also imports `ERROR_CODES` from `@api/error-codes` for the `BAD_REQUEST` code.

## Notes
- The error response is a 400 with code `BAD_REQUEST` and `details: { reason: 'body-too-deep', maxDepth: MAX_JSON_DEPTH }`.
- Scope is JSON only. urlencoded bodies are bounded by `qs`'s own depth limit, and multipart field names by multer's.
- Only containers are counted: scalars and `null` are skipped, and the check fails when a container sits at a depth greater than the limit.
