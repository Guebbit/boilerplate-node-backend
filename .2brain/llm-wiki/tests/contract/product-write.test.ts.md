---
source: tests/contract/product-write.test.ts
sha256: c15aff13dfdb5a6a98e00350a7ff271c44015674a8212862cdeab85371b1580b
generated_at: 2026-11-14T22:58:33.461424+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/product-write.test.ts

## Purpose

Contract tests for the multilingual product write HTTP surface (`POST /products`, `PUT`/`PATCH /products/{id}` and the `translations` map on `GET`). Runs over real HTTP with a seeded test database. Lives at the top-level `tests/contract/` rather than under `src/modules/products/tests/` because driving these routes requires a real `locales` collection row, which the products module may only reach through the kernel translation port.

## Key elements

- **`setupTestDb()`** — called at module level; initialises the test database before any test runs.
- **`fieldPriceMin()`** — builds the expected 422 error message for an invalid price by resolving the shipped `en` i18n string (`validation.invalid-format`).
- **`titleTooShort()`** — builds the expected 422 message for a title below the 5-character floor (`validation.too-small-string`).
- **`FALLBACK`** (`'en'`) — the fallback locale; seeded via `givenLocale` in `beforeEach`.
- **`describe('POST /products')`** — covers creation: happy path, title-length validation, price format/locale coercion, rejection of `null` fields, missing fallback locale, no-description default, stock-independence (receipt flow), and rejection of `onHand` in the create body.
- **`describe('PUT /products/{id}')`** — covers full replacement: happy path, `releaseDate` clearing ending a preorder, required-field enforcement (no "cleared" state for booleans), and deletion of locales omitted from the body.
- **`beforeEach`** — seeds the `en` fallback locale row via `givenLocale`.

## Relationships

- **`tests/support/http.ts`** — provides `api()`, `authenticateAs`, `authenticateAsRole`; importing it boots the real app and registers all module translatables.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the test database.
- **`tests/support/contract.ts`** — side-effect import (`import '@tests/contract'`) that configures contract-test globals/utilities.
- **`tests/support/replay.ts`** — `sendTwice` for idempotency/replay assertions.
- **`tests/support/credentials.ts`** — `credentialHolding` for role-specific auth token construction.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds products; `productRepository` reads stored state for assertions.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` seeds a locale row required for the translation pipeline.
- **`src/infrastructure/i18n/index.ts`** / **`context.ts`** — `translator('en')` resolves shipped i18n strings so tests assert on the actual copy rather than hardcoded literals.
- **`src/kernel/outbox.ts`** — `settleOutboxNudges()` flushes pending outbox events (used before reading stock after a receipt).

## Notes

- **`en` is the fallback locale** in every environment this suite targets (documented in `.env-example`); tests that omit it from `translations` expect a 422.
- **PUT is a full RFC 9110 §9.3.4 replacement**: every writable field (`active`, `purchasable`, `requiresShipping`, `allowBackorder`, `noWithdrawal`, `categories`, `tags`, `translations`) is required in the body. Omitting one is a 422, not a no-op.
- **Stock is not a product field.** `onHand` in a create body is rejected; units enter only via the inventory receipt endpoint, which is why that test uses `admin` (needs `read:StockLevel`) and `settleOutboxNudges`.
- **Error messages are resolved through `translator('en')`**, not hardcoded, so they stay in sync with shipped i18n copy.
- **PUT clearing `releaseDate`** (by omitting it) ends a preorder; `PATCH` is the mechanism for keeping a subset of locales.
