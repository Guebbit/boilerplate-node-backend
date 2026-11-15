---
source: src/infrastructure/http/middlewares/json-object.ts
sha256: 8923b7df65e51f3e9af64b5e74977a13bc0bd51c27d90da4045731a9c40f5c10
generated_at: 2026-11-14T18:02:11.499450+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/json-object.ts

## Purpose

Express middleware that rejects parsed JSON bodies that are not plain objects (e.g. scalars, arrays, `null`) with a 422 `VALIDATION_ERROR`. It exists because `express.json` runs in non-strict mode (RFC 8259 §2), so any JSON value passes the parser; this guard ensures every body this API expects is an object, preventing silent no-ops (scalar PATCH → 200) or unfiltered queries (scalar search → full list).

## Key elements

- **`requireJsonObjectBody`** (exported) — the sole export. Checks `request.body` with `isPlainObject`, and either calls `next()` or short-circuits with a 422 via `rejectResponse`. Skips the check entirely when the request has no JSON content-type or the body is `undefined` (no parser consumed it).

## Relationships

- **`src/infrastructure/http/middlewares/json-depth.ts`** — supplies the `JSON_BODY_TYPES` constant used to gate on content-type before inspecting the body.
- **`src/infrastructure/object-guards.ts`** — supplies `isPlainObject`, the structural check that distinguishes `{}` / `{a:1}` from `[]`, `"x"`, `5`, `true`, `null`.
- **`src/infrastructure/http/response.ts`** — supplies `rejectResponse`, the shared helper that builds the error envelope and sends it.
- **`src/infrastructure/i18n/index.ts`** — supplies `t()` for localising the error message.
- **`src/app/security.ts`** — mounts this middleware into the request pipeline; it also knows which routes are raw-body (webhook) paths and skips them so they never reach this guard.
- **`tests/unit/infrastructure/http/middlewares/json-object.test.ts`** — unit tests covering the accept/reject branches.

## Notes

- **422, not 400.** The JSON is syntactically valid (the parser already accepted it); the *document* is what's unprocessable. Unparseable JSON still gets the parser's 400. See RFC 5789 §2.2.
- **`request.body === undefined` passes.** This means the body was never consumed by a JSON parser (e.g. a raw-body webhook path). The guard deliberately does not reject those.
- **Ordering with `json-depth`.** This middleware assumes the body has already been parsed and depth-checked; it only validates the *shape* (object vs. non-object), not nesting depth.
- **Content-type gate.** Non-JSON bodies (form-encoded, raw) are untouched, even if `request.body` happens to be set by an earlier middleware.
