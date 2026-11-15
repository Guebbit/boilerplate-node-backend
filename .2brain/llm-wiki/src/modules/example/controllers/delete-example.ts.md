---
source: src/modules/example/controllers/delete-example.ts
sha256: 8accc39b9d8b0942b56b29e61b56206fc0cd7926e5f127ed39e34bdc9136298c
generated_at: 2026-11-14T19:56:36.416901+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/controllers/delete-example.ts

## Purpose

Hand-written controller for `DELETE /examples/:id`. It exists in place of the shared delete factory because that factory emits a soft/hard delete triplet, while the example module has only a single (hard) delete tier. It validates the id, enforces caller permissions, supports optimistic concurrency via `If-Match`, and delegates to the example service.

## Key elements

- **`deleteExample`** (exported) – Express controller handler for `DELETE /examples/:id`. Flow: validate id → check `If-Match` precondition → call the service → respond `204 No Content` on success, `404` on missing/unknown/unauthorized id, `412` on stale ETag.
- **`requireId`** usage – extracts and validates the `:id` param; a missing, malformed, or unresolvable id all short-circuit to `404` with the `example.not-found` i18n key.
- **`withIfMatch`** – wraps the service call so a non-matching `If-Match` header yields `412 Precondition Failed` before any write occurs.
- **`refused`** – inspects the service result for a permission denial and emits the appropriate `404` (not `403`) to the client.
- **`catchAs`** – catches any thrown error and maps it to the correct HTTP response using the `deleteExample` tag.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/ids.ts` | Provides `requireId` for id-param validation. |
| `src/infrastructure/http/preconditions.ts` | Provides `withIfMatch` for `If-Match` ETag gating. |
| `src/infrastructure/http/request.ts` | Provides `callerContextOf` to extract the authenticated caller for the service call. |
| `src/infrastructure/http/response.ts` | Provides `noContentResponse` (204) for the success path. |
| `src/infrastructure/http/controller.ts` | Provides `catchAs` (error mapping) and `refused` (permission-denial detection). |
| `src/modules/example/services/index.ts` | Exports `exampleService`, which this controller imports to perform the actual deletion. |
| `src/modules/example/routes.ts` | Wires `deleteExample` onto the router (imported by the routes file, not by this file). |

## Notes

- **404 for permission denials.** A caller who is not allowed to delete a valid example receives the same `404` as an unknown id, preventing existence leakage.
- **No soft-delete tier.** Unlike modules that use the shared factory, this module deletes outright; there is no `deleted` flag or restore path to be aware of.
- **Versioned resource.** The `withIfMatch` guard means concurrent deletes are fenced by ETag; clients that omit `If-Match` are subject to the service's own concurrency handling.
