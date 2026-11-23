---
source: src/modules/cart/events.ts
source_sha256: bfb5cd16eac13902f67e3fba6e557fec1a9de156503da5411096b1869e85c117
context_sha256: e7f11a398c1bd2ab386afcf826f9a0f10ca73c748c76927d9a5e6e066a78c854
generated_at: 2026-11-22T04:32:52.151769+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/events.ts

## Purpose
Declares the names of the domain events the cart module emits. The events themselves are specified in `./asyncapi.domain-events.yaml`. The file exports the names as constants so emitters and listeners share one spelling.

## Key elements
- `CART_LINES_REMOVED` — the string `'cart.lines_removed'`.
- `CART_MERGE_REFUSED` — the string `'cart.merge_refused'`. It corresponds to the `cart.merge_refused` channel in the AsyncAPI file.

Both constants use `satisfies DomainEventName`, so the compiler checks each name against the kernel's event-name type. The literal type is preserved.

## Relationships
- **`src/kernel/events.ts`**: provides the `DomainEventName` type (imported with `import type`, so there is no runtime dependency).
- **`src/modules/cart/services/cleanup.ts`, `src/modules/cart/services/merge.ts`, `src/modules/cart/index.ts`, and the integration tests** (`line-availability`, `line-cap`, `merge-atomic`, `merge-effects`, `merge`): these are graph neighbors of this file, so they presumably emit or listen for these events. The file itself shows only the exports, not how they are used.

## Notes
- Adding a new cart event means declaring it in `asyncapi.domain-events.yaml`. The name must also be accepted by `DomainEventName`, or the `satisfies` check will fail to compile.
