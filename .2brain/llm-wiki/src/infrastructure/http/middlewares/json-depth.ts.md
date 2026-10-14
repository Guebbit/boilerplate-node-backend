---
source: src/infrastructure/http/middlewares/json-depth.ts
sha256: 5b14e5a3370d1142a26e6ef53cdce2a056aebc162fe744422bafd9e409800c36
generated_at: 2026-10-14T07:56:55.437742+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/json-depth.ts

## Purpose

An Express middleware that rejects JSON request bodies nested deeper than a fixed limit (`MAX_JSON_DEPTH = 32`) with a 400 response. It exists because `express.json`'s byte-size limit does not protect against stack-overflow (`RangeError`) in any downstream recursive walk (Zod parsing, idempotency fingerprinting, cache-key hashing). Positioned immediately after the body parser, before route handlers, so a single guard covers all consumers.

## Key elements

- **`MAX_JSON_DEPTH`** (exported const) — the allowed maximum container nesting depth (32). The root object/array counts as depth 1.
- **`exceedsDepth(root, limit)`** (exported function) — iterative depth check using an explicit stack (`pending`). Returns `true` as soon as any container is found at depth > `limit`. Avoids recursion so it cannot itself throw the `RangeError` it guards against.
- **`limitJsonDepth(request, response, next)`** (exported middleware) — the Express handler. Checks `request.is(JSON_TYPES)` to skip non-JSON bodies, then calls `exceedsDepth`. On violation, responds 400 via `rejectResponse` with `ERROR_CODES.BAD_REQUEST` and a `details.reason` of `'body-too-deep'`. Otherwise calls `next()`.
- **`JSON_TYPES`** (internal const) — `['application/json', 'application/merge-patch+json']`, the media types parsed by `express.json` in `app/security.ts`.

## Relationships

- **`src/app/security.ts`** — Configures `express.json` and sets the media types this guard checks via `request.is()`. This middleware is registered right after the parser there.
- **`src/infrastructure/http/response.ts`** — Provides `rejectResponse`, the standard 4xx/5xx response helper used to emit the 400.
- **`src/infrastructure/i18n/index.ts` / `src/infrastructure/i18n/context.ts`** — Provide the `t()` translation function used for the error message string.
- **`tests/unit/infrastructure/http/middlewares/json-depth.test.ts`** — Unit tests for `exceedsDepth` and `limitJsonDepth`.

## Notes

- **Iterative, not recursive.** The doc comment explicitly warns that a recursive implementation would throw the same `RangeError` this guard prevents. The explicit `pending` stack is intentional.
- **JSON-only scope.** `urlencoded` bodies are bounded by `qs`'s own depth limit and multipart field names by multer's; this middleware does not touch them.
- **Depth counting convention.** The root container is depth 1, so `MAX_JSON_DEPTH = 32` means 31 levels of nesting *inside* the root are permitted.
- **`request.is()` gate.** When the body is absent or a non-JSON media type, `exceedsDepth` is never called — no wasted walk.
