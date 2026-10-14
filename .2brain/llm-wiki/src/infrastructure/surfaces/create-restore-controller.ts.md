---
source: src/infrastructure/surfaces/create-restore-controller.ts
sha256: 6f28f9278172a424100a584b4dac31ee5e4525448b961188d434c0fa262ecfcd
generated_at: 2026-10-14T08:19:06.046822+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-restore-controller.ts

## Purpose

Generic factory that builds a `POST /x/:id/restore` Express handler for any module whose `DELETE /x/:id` soft-deletes a record. It exists as a separate verb because HTTP DELETE must be safe to repeat (RFC 9110 §9.2.2), so a retried DELETE can never accidentally restore a record.

## Key elements

- **`RestoreControllerSpec<TRow>`** — interface of the three things that differ per entity: `entity` (lower-case singular name for logging/operation naming), `restore` (service call returning `ServiceResult<TRow>`; takes the raw `Request` so the module can build its own `CallerContext`), and `present` (projection that shapes the restored row into the entity's read contract). Also carries `notFoundKey` for the i18n error message.
- **`createRestoreController<TRow>(spec)`** — returns a `namedHandler` (operation name `restore{Entity}`, e.g. `restoreOrder`). Flow: extract `:id` via `requireId` → call `spec.restore(id, request)` → on refusal send the error envelope (404 / 409) and stop → otherwise pass `result.data` through `spec.present` and reply with `successResponse` (200). Unhandled rejections are forwarded to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — source of `catchAs`, `namedHandler`, `operationName`, `refused`, and the `ServiceResult` type used to interpret the service call's outcome.
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which extracts and validates `:id` from the route params, short-circuiting with the entity's `notFoundKey` if absent/malformed.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 reply.
- **`src/modules/orders/controllers/restore-orders.ts`**, **`src/modules/products/controllers/restore-products.ts`**, **`src/modules/users/controllers/restore-users.ts`** — consumers; each supplies a `RestoreControllerSpec` (entity name, its service-level `restore` call, its read projection, its i18n key) to get a ready-to-mount Express handler.

## Notes

- A malformed or missing `:id` is answered as *not found* (404), not 400 — intentionally indistinguishable from a genuinely absent record.
- `spec.present` must return the same shape the entity's own reads return; restore must never expose fields a read would hide.
- The `restore` callback receives the raw `Request` (not a pre-built context) so the owning module controls how it assembles its `CallerContext` for audit logging, matching the pattern used by `createUpdateController`'s `update`.
- A 409 is returned when the id exists but the record is **not** soft-deleted (i.e., there is nothing to restore).
