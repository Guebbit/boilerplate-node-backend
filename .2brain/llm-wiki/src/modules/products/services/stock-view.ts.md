---
source: src/modules/products/services/stock-view.ts
source_sha256: e182b59cd1d112524f3224d686cea2dbbca10d74ee33ba5c0f88220ce75fb4a4
context_sha256: bde1cb3b895fd91b9034f5e473fd9d487d44c98828a94f7781bdee1d034658f2
generated_at: 2026-11-22T07:14:07.731546+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/stock-view.ts

## Purpose
Decides who may see exact stock counters. Exact stock can leak sales velocity to competitors and aid denial-of-inventory attacks, so it is exposed only to callers holding `read:StockLevel`, via `GET /inventory/levels/{productId}`. The product response never carries these counters, for anyone.

## Key elements
- `canSeeStock(caller?: Caller): boolean` — the only export. An anonymous caller (`undefined`) is denied. Otherwise it returns `holds(caller, 'read', 'StockLevel')`.

## Relationships
- `src/kernel/ability.ts` — provides `holds`, which performs the actual permission check.
- `src/types/auth-context.ts` / `src/types/index.ts` — the `Caller` type is imported from `@types`.
- `src/modules/products/services/index.ts` — a graph neighbor, likely the module's service barrel. This file's content doesn't show how it is used there.
- `src/modules/products/tests/unit/stock-view.test.ts` — unit tests for this module.
- `src/modules/orders/services/crud.ts` — a graph neighbor. This file's content shows no direct interaction with it.

## Notes
- The caller is expected to be `request.caller`, which is `undefined` for anonymous requests.
- This file only answers the yes/no question. Enforcing it on the endpoint and stripping counters from product responses happen elsewhere.
