---
source: src/infrastructure/http/middlewares/json-depth.ts
sha256: 94d2a2ac5a4f7c5bb8a96170e800b0a1ab397fec01f7fc6fc5956518becae670
generated_at: 2026-11-08T03:31:17.988771+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/json-depth.ts

## Purpose

Express middleware that rejects JSON request bodies nested deeper than 32 levels with a 400. It exists because `express.json`'s byte limit does not bound nesting depth—a small body of 50 000 nested arrays parses fine, then throws `RangeError` on the first recursive walk (Zod, fingerprinting, cache-key hashing), surfacing as a repeatable 500. Placed immediately after the body parser and before any route, one guard protects every downstream consumer.

## Key elements

- **`MAX_JSON_DEPTH`** (32) – exported constant; the deepest allowed container depth.
- **`JSON_BODY_TYPES`** – `['application/json', 'application/merge-patch+json']`; the Content-Types this middleware inspects. Matches the list `security.ts` passes to `express.json`.
- **`exceedsDepth(root, limit)`** – iterative (explicit stack) depth check. Root container is depth 1; returns `true` if any container exceeds `limit`.
- **`limitJsonDepth(req, res, next)`** – the Express middleware. Skips non-JSON / body-less requests via `request.is`; otherwise calls `exceedsDepth` and, on failure, responds 400 with `ERROR_CODES.BAD_REQUEST` and a `body-too-deep` detail.

## Relationships

- **`src/app/security.ts`** – mounts the JSON parser with the same `JSON_BODY_TYPES` list; this middleware is registered right after that parser.
- **`src/infrastructure/http/response.ts`** – provides `rejectResponse`, used to emit the 400 response.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – provides the `t` translation function for the user-facing error message.
- **`tests/unit/infrastructure/http/middlewares/json-depth.test.ts`** – unit tests covering `exceedsDepth` and the middleware.

## Notes

- The depth check is **iterative** (stack-based) on purpose: a recursive check would throw the same `RangeError` this middleware is designed to prevent.
- Scope is **JSON only**. `urlencoded` bodies are bounded by `qs`'s own `depth` option; multipart field names by multer.
- `request.is` returns `false` when there is no body or the Content-Type is not in `JSON_BODY_TYPES`, so the middleware is a no-op for those requests.
- The root object/array counts as depth 1, so a flat `{"a":1}` is depth 1 and always passes.
