---
source: src/modules/delivery/services/force.ts
sha256: 1b2edb0e1485dac02905936ad207d234b18c6f96604c42e02e88798a0732e7b1
generated_at: 2026-10-14T15:29:31.209357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/force.ts

## Purpose

Single source of truth for the contract that a `forced: true` request imposes on a caller. Both the `ship` and `deliver` routes accept a `forced` flag; this file centralizes the two requirements (a stricter permission and a mandatory reason) so the two routes cannot drift on what "forced" actually demands.

## Key elements

- **`refuseUnearnedForce(context, forced, reason)`** *(exported const)* — Guard function. When `forced` is falsy it returns `undefined` immediately. Otherwise it checks, in order:
  1. The caller holds the `orders.any.override` ability → **403** (`FORBIDDEN`) if not.
  2. A non-empty `reason` string was supplied → **422** (`DELIVERY_OVERRIDE_REASON_REQUIRED`) if not.

  Returns a `ResponseReject` object on failure, `undefined` on success. Does not throw; the caller is expected to spread the reject into the HTTP response.

## Relationships

- **`src/modules/delivery/services/ship.ts`** / **`src/modules/delivery/services/deliver.ts`** — Consumers. Each calls `refuseUnearnedForce` before executing its core logic, so the "forced" contract lives in one place.
- **`src/kernel/ability.ts`** — Provides `holdsKey`, the predicate used to verify the `orders.any.override` ability.
- **`src/infrastructure/http/response.ts`** — Provides `generateReject` (shapes the 403/422 body) and the `ResponseReject` type.
- **`src/infrastructure/i18n/index.ts`** — Provides `t` for the localized error-message strings.
- **`src/types/index.ts`** / **`src/types/auth-context.ts`** — Source of the `CallerContext` type that carries the caller's identity and abilities.

## Notes

- The `orders.any.override` ability is intentionally *additional* to whatever route-level permission gate (e.g. `delivery.any.update`) the ship/deliver routes already enforce. Holding the route permission alone is not enough to force.
- `reason` is required **only** when `forced` is `true`; a non-forced request never needs it.
- The function never mutates or throws — it is a pure "refusal calculator" that returns either a reject payload or `undefined`, keeping the call site a simple `if (reject) return reject;` pattern.
