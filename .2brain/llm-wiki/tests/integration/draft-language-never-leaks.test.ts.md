---
source: tests/integration/draft-language-never-leaks.test.ts
sha256: a78d8ea89ee1cc136609c4799c5b62467887fd423664fcc6d02cc23b2d31d682
generated_at: 2026-10-29T06:54:37.281157+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/draft-language-never-leaks.test.ts

## Purpose

Integration test that proves a product's text in a **draft (inactive) language** never reaches a customer-facing surface. It exercises the full module stack (no unit-level isolation) to guard against leaks through the doors the storefront read does not cover: outgoing mail, persisted outbox events, and cross-module name copying.

## Key elements

- **`DRAFT_TITLE`** (`'Tazza segreta'`) — sentinel string asserted *absent* from every customer-facing artifact.
- **`productWithDraftFrench(overrides?)`** — fixture helper: creates en/it live locales, a draft `fr` locale, a product, and sets per-locale translations. Optionally sets `onHand` for stock-alert scenarios.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a jest mock so tests can inspect the exact payload without sending mail.
- **`beforeEach`** — resets domain events, re-registers modules, and re-seeds translatable-field metadata via `resolveTranslatables`.
- **Four `describe` blocks** covering the distinct leak vectors:
  1. `productService.titlesById` excludes the draft language until it is activated.
  2. A back-in-stock mail body and its `STOCK_ALERT_SENT` outbox event contain only live-language names, even when the buyer's stored `locale` is the draft one.
  3. An admin GET `/products/:id` still returns the draft translation (editor must see it).
  4. A staff `Accept-Language: fr` preview does not mutate the names later copied into a message.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is fully mocked; the test asserts on its call arguments to verify no draft text in the mail.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes pending outbox processing; `outboxEventModel` is queried to confirm the persisted `STOCK_ALERT_SENT` event carries no draft title.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears the in-memory event bus between tests.
- **`src/kernel/registry.ts`** — `registerModules` / `resolveTranslatables` wire the enabled module set and its translatable-field map before each test.
- **`src/modules.ts`** — exports `enabledModules`, the canonical list fed to the registry.
- **`src/modules/products/index.ts` / `services/index.ts`** — `productService.titlesById` is the primary "names a message copies" API under test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the product document.
- **`src/modules/locales/services/index.ts`** — `localeService` drives translation writes, language activation, and translatable registration.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` seeds locale records (en, it, fr-inactive).
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService.receive` triggers the back-in-stock flow that enqueues the mail and emits the stock-alert event.
- **`src/modules/stock-alerts/events.ts`** — `STOCK_ALERT_SENT` constant used to locate the outbox event.
- **`src/modules/users/model.ts`** — `userModel.updateOne` sets a customer's stored `locale` to the draft language to test the "buyer's language is the draft one" edge case.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for direct service calls (e.g., `inventoryService.receive`).

## Notes

- The test deliberately uses **real** module wiring (no module-level mocks) because the original leak crossed two modules and a port boundary; isolating one side would mask the bug.
- `afterAll` clears translatables on `localeService` to prevent cross-suite contamination.
- The stock-alert test posts to `/stock-alerts` over HTTP *then* calls `inventoryService.receive` directly — the HTTP call sets up the alert subscription, while the direct call simulates stock arriving (avoids needing a real stock-drop path).
- `settleOutboxNudges` must be awaited before asserting on the outbox; without it the event may still be in-flight.
