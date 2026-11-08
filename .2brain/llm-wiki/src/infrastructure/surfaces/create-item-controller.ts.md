---
source: src/infrastructure/surfaces/create-item-controller.ts
sha256: 3fd95ebea13fcaa506a428dda4799636eebc6163879143e1dd01ebcd2eff63ea
generated_at: 2026-11-08T03:50:47.290570+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-item-controller.ts

## Purpose

Factory for the shared "read-one" (GET by path id) Express handler. Centralizes the contract that a malformed id and a missing record both answer with the module's own 404 key, so every entity module gets identical behaviour from one landing site instead of duplicating the logic inline.

## Key elements

- **`ItemControllerSpec`** (interface) — the four things that differ per entity:
  - `entity` — lower-case singular name (e.g. `'product'`); feeds `operationName` so logs, stack traces, and generated docs all agree.
  - `fetch(id, request)` — the module-specific row lookup. Returns `unknown`; a miss is `null`/`undefined`/`void`. Receives the `Request` because visibility filtering (scope, permission) is caller-specific.
  - `notFoundKey` — i18n key used for both the "bad id" and "no record" 404.
- **`createItemController`** (exported function) — takes an `ItemControllerSpec`, returns a named Express handler that:
  1. Calls `requireId` to validate the path parameter (404 before any DB call if it fails).
  2. Calls `fetch`; on a miss sends 404 via `rejectResponse`.
  3. On success sets an ETag (`setEtag`) and returns the item via `successResponse`.
  4. Wraps unexpected errors with `catchAs`.

## Relationships

- **`@infrastructure/http/controller`** — imports `operationName` (builds the `get<Entity>Item` label), `namedHandler` (attaches the name for tracing), and `catchAs` (unifies error handling).
- **`@infrastructure/http/ids`** — imports `requireId` to validate the path parameter before the service is called.
- **`@infrastructure/http/response`** — imports `successResponse` and `rejectResponse` for the 200 / 404 paths.
- **`@infrastructure/http/preconditions`** — imports `setEtag` to stamp the version token the edit form will echo back as `If-Match`.
- **`@infrastructure/i18n`** — imports `t` to translate the `notFoundKey` into the response body.
- **`src/modules/*/controllers/get-*.ts`** (example, products, users, webhooks) — consumers; each supplies its own `ItemControllerSpec` and mounts the returned handler on its route.
- **`tests/unit/infrastructure/surfaces/create-item-controller.test.ts`** — unit test covering the happy path, 404-on-miss, 404-on-bad-id, and error-rejection branches.

## Notes

- A malformed id is **not** a 400; it is deliberately answered as 404 with the same `notFoundKey`. This is a contract decision ("a malformed id answers as an unknown one") and should stay in this one place.
- `fetch` is typed `(id, request) => Promise<unknown>` on purpose: the controller never inspects the item's shape, so any serialisable value passes through unchanged.
- The operation name is built as `get` + `entity` + `Item` (e.g. `getProductItem`). If you rename `entity` in a module spec, the log line, stack-trace label, and `docs/modules/` table all shift with it.
