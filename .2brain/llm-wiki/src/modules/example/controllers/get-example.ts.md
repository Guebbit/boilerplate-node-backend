---
source: src/modules/example/controllers/get-example.ts
sha256: cefd64b7973650b571c6334ee95976395e61cbcb497a19eb95635ec65403bd74
generated_at: 2026-10-14T15:40:29.890397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/get-example.ts

## Purpose

Defines the two read-one (GET by id) HTTP handlers for the `example` module: the authenticated `GET /examples/:id` and the publicly accessible `GET /examples/published/:id`. Both are thin delegations to the shared item-controller factory, which centralises 404 handling so that an unknown id and a malformed id produce the same response.

## Key elements

- **`getExample`** – Controller for `GET /examples/:id`. Passes the caller's auth context (`callerContextOf(request)`) into `exampleService.getById`.
- **`getPublishedExample`** – Controller for `GET /examples/published/:id`. No auth context is forwarded; calls `exampleService.getPublishedById`. Uses `handlerSuffix: 'Published'` to distinguish its route registration.
- Both share `entity: 'example'` and `notFoundKey: 'example.not-found'`, meaning the 404 response shape and i18n key are owned by `createItemController`, not this file.

## Relationships

- **`src/infrastructure/surfaces/create-item-controller.ts`** — Provides the `createItemController` factory that both exports call. The factory owns 404 semantics and route-suffix logic; this file only supplies `fetch` and config.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf`, used by `getExample` to extract the authenticated caller's context for the service call.
- **`src/modules/example/services/index.ts`** — Exports `exampleService`; both controllers delegate their data-fetching to it (`getById` / `getPublishedById`).
- **`src/modules/example/routes.ts`** — Upstream consumer that imports these two controllers and mounts them on the module's router.

## Notes

- 404 is **not** handled here. If a service call throws or returns nothing, `createItemController` translates it to the `example.not-found` response. Do not add manual 404 checks in `fetch`.
- The `published` variant intentionally omits the `request` parameter in its `fetch` closure—no caller context is needed because the route sits outside the auth gate.
- The doc-block references `docs/theory/request-flow.md` for the full request → controller → service flow.
