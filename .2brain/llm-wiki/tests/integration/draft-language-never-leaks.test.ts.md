---
source: tests/integration/draft-language-never-leaks.test.ts
sha256: a78d8ea89ee1cc136609c4799c5b62467887fd423664fcc6d02cc23b2d31d682
generated_at: 2026-11-08T09:37:58.416949+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/draft-language-never-leaks.test.ts

## Purpose

Integration test that verifies product text written in a **draft (inactive) language** is never exposed to customers through any channel that "outlives" the product—emails, outbox events, or serialized payloads—while remaining visible to editors. It closes the gap left by the storefront-translation test by exercising every other door the draft title could leak through, all driven through the real modules.

## Key elements

- **`DRAFT_TITLE`** (`'Tazza segreta'`) — the French title that must never appear in customer-facing output.
- **`productWithDraftFrench(overrides?)`** — async helper that creates an EN/IT product, sets `fr` as an inactive locale, writes an Italian translation and the draft French translation, and returns the product ID.
- **`describe('the names a message outlives its product with')`** — asserts `productService.titlesById` omits the draft language, then includes it after `localeService.activateLanguage('fr')`.
- **`describe('a back-in-stock mail and its event')`** — sets a customer's stored locale to `fr`, triggers a stock alert via the API and `inventoryService.receive`, then asserts neither the mocked `enqueueEmail` call nor the `STOCK_ALERT_SENT` outbox row contains `DRAFT_TITLE`.
- **`describe('the editor')`** — confirms an admin `GET /products/:id` still returns the draft `fr` title in `translations`.
- **`describe('a staff preview just before a back-in-stock mail')`** — sends an admin `Accept-Language: fr` preview request and verifies `titlesById` output is unchanged (no draft title injected by the preview).
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a spy so mail payloads can be inspected without side effects.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the only mocked module; `enqueueEmail` is spied on to assert mail content.
- **`src/kernel/events.ts`** — `resetDomainEvents()` is called in `beforeEach` to clear the event bus between tests.
- **`src/kernel/outbox.ts`** — `outboxEventModel` queries persisted outbox rows; `settleOutboxNudges()` flushes pending nudges before assertions.
- **`src/kernel/registry.ts`** — `registerModules` and `resolveTranslatables` wire up the module graph for the test run.
- **`src/modules.ts`** — provides `enabledModules`, the canonical list passed to registration.
- **`src/modules/locales/services/index.ts`** — `localeService` handles `updateEntityTranslations`, `activateLanguage`, and `setTranslatables`.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` seeds locale records (including the inactive `fr`).
- **`src/modules/products/index.ts` / `services/index.ts`** — `productService.titlesById` is the API under test for "what names does a message copy in?"
- **`src/modules/products/tests/factories.ts`** — `createProduct` builds the base product fixture.
- **`src/modules/inventory/index.ts` / `services/index.ts`** — `inventoryService.receive` triggers the stock-alert flow that produces the email and outbox event.
- **`src/modules/stock-alerts/events.ts`** — `STOCK_ALERT_SENT` is the event name used to find the outbox row.
- **`src/modules/users/model.ts`** — `userModel` is used to set a customer's stored `locale` field directly.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity required by `inventoryService.receive`.

## Notes

- The test explicitly does **not** validate the customer's stored locale against the supported-language list (see inline comment); a profile may reference any locale code, so the system must handle it.
- `settleOutboxNudges()` must be awaited **before** asserting on `outboxEventModel` or `mockEnqueueEmail`; the outbox is processed asynchronously.
- The file references a sibling test (`locales/tests/integration/translations.test.ts`) that covers the storefront read path; this file covers all *other* egress paths.
- `afterEach` clears all mocks; `afterAll` resets `localeService` translatables to `{}` to avoid cross-suite contamination.
