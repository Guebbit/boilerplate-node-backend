---
source: src/modules/delivery/services/force.ts
sha256: 4daf7d5e85671b0e93d9cdffdeb4cdc013b9e02a6d3f095bf3568149485a88c3
generated_at: 2026-10-15T10:27:50.381131+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/force.ts

## Purpose

Centralizes the validation rule for the `forced: true` request flag so that both delivery entry points (`ship` and `deliver`) enforce identical requirements and cannot drift apart. Without this shared guard, each door would need its own copy of the permission and reason checks.

## Key elements

- **`refuseUnearnedForce(context, forced, reason)`** — The single export. When `forced` is falsy it returns `undefined` immediately (pass-through). When `forced` is truthy it:
  1. Returns a **403** `ResponseReject` if the caller does not hold the `orders.any.override` ability key.
  2. Returns a **422** `ResponseReject` with a `fieldError` on `reason` if no reason string was supplied.
  3. Returns `undefined` if both checks pass.

## Relationships

- **`@kernel/ability`** — calls `holdsKey` to verify the caller's `orders.any.override` permission.
- **`@infrastructure/http/response`** — uses `generateReject` and `fieldError` to build the 403/422 rejection payloads; typed against `ResponseReject`.
- **`@infrastructure/i18n`** — calls `t` to resolve human-readable error messages (`generic.error-forbidden`, `delivery.override-reason-required`).
- **`@types`** — consumes the `CallerContext` type for the caller parameter.
- **`../deliver.ts` / `../ship.ts`** — the two call-sites that import `refuseUnearnedForce` and gate their handlers on its return value before proceeding.

## Notes

- The route-level `delivery.any.update` gate is explicitly **not** sufficient; `orders.any.override` is a stricter, independent ability. Callers must hold *both*.
- The function returns `undefined` on success (not `null` or a success object). Callers should treat "falsy / undefined" as "proceed" and a non-undefined `ResponseReject` as "abort with this response."
- `reason` is only validated when `forced` is truthy; a missing reason on a normal (non-forced) call is irrelevant here.
