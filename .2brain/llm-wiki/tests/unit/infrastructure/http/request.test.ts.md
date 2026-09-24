---
source: tests/unit/infrastructure/http/request.test.ts
sha256: 9b76aff9ecdff79c563ec71061bafb684a28e90c3d8bb883a6a3adbee75ef830
generated_at: 2026-09-23T20:23:04.312627+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/request.test.ts

## Purpose

Unit tests for `readInput` (and its sibling helpers) in `@infrastructure/http/request`. Every controller funnels through `readInput`, yet integration/contract suites never exercise its edge cases in isolation. This file pins each rule the function encodes—source precedence per surface, ID extraction semantics, multipart-only transport decoding, and the express-5 "body is `undefined`" path—so regressions are caught at the unit level rather than surfacing as a 500 in a real request.

## Key elements

- **`makeRequest(overrides)`** – builds a minimal express `Request` stub (params, query, body) plus a working `is()` that returns `null` when no content-type is set, mirroring express's behavior for body-less requests.
- **`makeResponse()`** – builds an express `Response` stub that records `status()` / `json()` calls for assertions on error responses.
- **`describe('readInput') / describe('precedence')`** – verifies the surface→source precedence chain (`search`→body, `write`/`delete`/`path`→params), fallback when the higher source is absent, key merging, dropping of explicitly-`undefined` values, survival of a body-less request, and that pagination keys are reported absent (not defaulted).
- **`describe('readInput') / describe('ids')`** – verifies the `ids` option: first-declared-source-wins, empty-string fall-through, first-entry-of-array extraction, and key-absence when no source carries the value.
- **`describe('readInput') / describe('transport decoding')`** – verifies multipart-only coercion of booleans, numbers, and string arrays; confirms unparseable numbers stay as strings (not `NaN`) and blank strings stay as `''` (not `0`).
- **`OBJECT_ID`** – a fixed valid 24-hex ObjectId used wherever format validation must pass.
- Imports under test: `readInput`, `callerContextOf`, `extractAndValidateId`, `isValidObjectId`, `parseFormBoolean` (from `@infrastructure/http/request`); `callerInScope` (from `@kernel/permissions`); `asCustomer` (from `tests/support/callers`); `asStub` (from `@tests/stub`).

## Relationships

- **`src/infrastructure/http/request.ts`** – the module under test; this file imports and exercises every exported function.
- **`src/kernel/permissions.ts`** – supplies `callerInScope`, used to set up the permission context that `callerContextOf` reads.
- **`tests/support/callers.ts`** – supplies `asCustomer`, a factory for caller fixtures passed into `callerContextOf` / `callerInScope`.
- **`tests/support/stub.ts`** – supplies `asStub`, the generic stub helper used to construct the `Request` and `Response` stand-ins.

## Notes

- **Express 5 vs 4 body default:** express 5 leaves `request.body` as `undefined` when no body is sent (express 4 defaulted to `{}`). Tests explicitly cover the body-less path because reading a body key before precedence is applied would throw rather than fall through to `params`.
- **Transport-conditional decoding:** multipart coercion (booleans, numbers, string arrays) is applied _only_ when the content-type is multipart. JSON bodies already carry native types, so decoding them would be destructive. Tests assert both sides of that boundary.
- **Empty-string ≠ zero for numbers:** `Number('')` is `0`, but the code deliberately leaves `''` untouched so that a missing form field is not silently turned into a valid (free) price. Unparseable values stay as the original string so downstream validators can reject them with their own contract message.
- **`is()` returns `null`, not `false`,** when `contentType` is `undefined`, matching express's behavior for requests with no body. Tests rely on this distinction.
- The file header comment warns that `readInput` is "small enough to look self-evident" and that the integration/contract suites exercise it without asking it its own questions—this file exists to close that gap.
