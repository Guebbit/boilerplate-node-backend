---
source: src/infrastructure/http/middlewares/json-depth.ts
sha256: 94d2a2ac5a4f7c5bb8a96170e800b0a1ab397fec01f7fc6fc5956518becae670
generated_at: 2026-10-29T02:03:06.470771+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/json-depth.ts

## Purpose

Rejects parsed JSON request bodies whose nesting exceeds a fixed depth (`MAX_JSON_DEPTH = 32`) with a 400, before any route or downstream walker (fingerprinting, cache-key hashing, Zod validation) can throw a `RangeError`. It fills the gap left by `express.json`, which enforces only a byte limit and therefore admits arbitrarily deep structures like `[[[…]]]`.

## Key elements

- **`MAX_JSON_DEPTH`** (const, exported) – the maximum allowed container depth (32).
- **`JSON_BODY_TYPES`** (const, exported) – the media types this guard inspects: `application/json` and `application/merge-patch+json`.
- **`exceedsDepth(root, limit)`** (exported) – iterative depth check using an explicit stack; returns `true` if any container sits deeper than `limit`. The root container counts as depth 1.
- **`limitJsonDepth(req, res, next)`** (exported) – Express middleware. Calls `request.is(JSON_BODY_TYPES)` to skip non-JSON requests, then runs `exceedsDepth` on `request.body`. On violation, responds 400 via `rejectResponse` with code `BAD_REQUEST` and a `details` object (`reason: 'body-too-deep'`, `maxDepth`); otherwise calls `next()`.

## Relationships

- **`src/app/security.ts`** – mounts the JSON parser with the same media-type list that `JSON_BODY_TYPES` mirrors; this middleware runs immediately after that parser.
- **`src/infrastructure/http/response.ts`** – supplies `rejectResponse`, the 400 reply helper used by `limitJsonDepth`.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – supplies the `t()` function that localises the error message string (`generic.error-bad-request`).
- **`tests/unit/infrastructure/http/middlewares/json-depth.test.ts`** – unit tests for `exceedsDepth` and the middleware.

## Notes

- **Iterative by design.** A recursive depth check would itself throw the `RangeError` this guard exists to prevent. The implementation uses a plain array as a stack.
- **Scope is JSON only.** Urlencoded bodies are bounded by `qs`'s depth limit and multipart field names by multer; this middleware intentionally ignores them (`request.is` returns false for those types).
- **`request.is()` semantics:** returns `false` when the body is absent or the `Content-Type` isn't in `JSON_BODY_TYPES`, so the guard is a no-op for those requests.
- **Depth counting:** the top-level container is depth 1. A body of `{a: {b: {c: 1}}}` is depth 3.
