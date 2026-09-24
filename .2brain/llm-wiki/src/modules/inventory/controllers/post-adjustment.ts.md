---
source: src/modules/inventory/controllers/post-adjustment.ts
sha256: 9d34ebe5b6ba4632fed89518c9ec01b2257a2e2e5920a4d5b117c838d72e8fd0
generated_at: 2026-09-23T18:43:52.956548+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/post-adjustment.ts

## Purpose

Express controller for `POST /inventory/adjustments`. Handles a stocktake correction — the module's primary audited endpoint, recording the admin identity, a signed quantity delta, and a typed reason for the change.

## Key elements

- **`postAdjustment`** _(exported function)_ — The sole export and route handler. Validates the body against `AdjustStockBody`, rejects zero-delta requests with 422, then delegates to `inventoryService.adjust()` and formats the response.

## Relationships

- **`../service`** (`src/modules/inventory/service.ts`) — Calls `inventoryService.adjust(productId, delta, note, callerContext)`; all business logic lives there.
- **`@infrastructure/http/controller`** (`src/infrastructure/http/controller.ts`) — Provides `parseBody` (Zod validation gate), `refused` (service-level rejection check), and `catchAs` (error→response mapping).
- **`@infrastructure/http/response`** (`src/infrastructure/http/response.ts`) — Emits the final JSON via `successResponse` / `rejectResponse`.
- **`@infrastructure/http/request`** (`src/infrastructure/http/request.ts`) — `callerContextOf(request)` extracts the authenticated admin context forwarded to the service.
- **`@infrastructure/i18n`** (`src/infrastructure/i18n/index.ts`, `context.ts`) — `t()` supplies the localized error message for the zero-delta rejection.
- **`src/modules/inventory/routes.ts`** — Registers `postAdjustment` on the `POST /inventory/adjustments` route.
- **`@types`** (`src/types/index.ts`) — `InventoryLevel` is the declared shape of the 200 response body.

## Notes

- The zero-delta guard (`delta === 0`) is a **controller-level check**, not a schema constraint. The inline comment states zero "can't be expressed as a schema constraint," so it is refused here with **422** rather than a 400 to signal "processable shape, invalid value" and to avoid writing a meaningless ledger row.
- The function is `async`-ish: it returns a `Promise` in every code path (the early-return branches use `return` or `return Promise.resolve()`), so the caller (routes) can `await` it uniformly.
- The service call receives `callerContextOf(request)` as its fourth argument — the admin identity is injected here, not inside the service.
