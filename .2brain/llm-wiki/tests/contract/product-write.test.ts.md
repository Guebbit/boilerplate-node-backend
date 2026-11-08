---
source: tests/contract/product-write.test.ts
sha256: b0c7381f46d287199c99753a63d471162db4e6e0df42551b382aeeb2e0ec6d83
generated_at: 2026-11-08T09:20:35.462968+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/product-write.test.ts

## Purpose

Contract tests for the multilingual product **write** surface (`POST /products`, `PUT /products/{id}`, `PATCH /products/{id}`) exercised over real HTTP. The file lives at top-level `tests/contract/` rather than under `src/modules/products/tests/` because driving these routes requires a real `locales` collection row, which the `products` module may only reach through the `kernel/translation.ts` port — making the suite inherently cross-module.

## Key elements

- **`fieldPriceMin()`** – Returns the English validation message for a price that fails the non-negative-decimal format rule, built via `translator('en')`.
- **`titleTooShort()`** – Returns the English "too-small-string" message for a title under the contract's 5-character minimum.
- **`FALLBACK`** (`'en'`) – The fallback locale guaranteed to exist in every test environment (see `.env-example`).
- **`beforeEach`** – Seeds the fallback locale via `givenLocale(FALLBACK)` before each test.
- **`describe('POST /products')`** – Covers creation: happy path, title/price validation, null-field rejection, missing fallback locale, description omission, stock invariance (products start at `onHand: 0`), and rejection of `onHand` in the create body.
- **`describe('PUT /products/{id}')`** – Covers full replacement: all writable fields required, `releaseDate` cleared when omitted (ending a preorder), stored locales deleted when absent from the body, and 422 on any missing required field.
- *(Truncated section)* – Presumably `describe('PATCH /products/{id}')` for partial updates.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported for side-effects; registers contract matchers/assertions used throughout the suite. |
| `tests/support/http.ts` | Supplies `api`, `authenticateAs`, `authenticateAsRole` for real HTTP calls; importing it boots the full application. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called once at module scope to provision a clean test database. |
| `src/modules/products/tests/factories.ts` | Provides `createProduct` (seed a product for PUT/PATCH tests) and `productRepository` (read back stored state for assertions). |
| `src/modules/locales/tests/factories.ts` | Provides `givenLocale` to guarantee a locale row exists before tests that reference non-`en` locales. |
| `src/infrastructure/i18n/index.ts` | Exports `translator`, used to build expected English validation messages inside the helpers. |
| `src/infrastructure/i18n/context.ts` | Indirectly participates via the translator's runtime context when `translator('en')` is resolved. |
| `src/kernel/outbox.ts` | `settleOutboxNudges()` is awaited after a create to drain pending outbox events before asserting on dependent resources (e.g. stock level). |
| `src/modules/products/repository.ts` | Backing store that `productRepository` (from factories) wraps; the tests read through it to verify persisted state. |

## Notes

- **PUT semantics are RFC 9110 §9.3.4**: the request body *is* the new resource. Fields like `active`, `categories`, `tags`, `allowBackorder`, `noWithdrawal` have no "cleared" state, so they are **all required** in a PUT body — omitting any yields 422.
- **PUT deletes stored locales it omits**; keeping an existing locale while changing others is what PATCH is for.
- **Stock is not a product field.** `products` never writes `onHand`; a new product starts at 0, and units enter only through a receipt (`POST /inventory/levels/{id}/receive`). The suite asserts both the rejection of `onHand` in the create body and the zero-then-receive flow (the latter requires `admin` role for `read:StockLevel`).
- **Price is currency-places-anchored**: `'10.5'` in → `'10.50'` out, regardless of how many decimal places were sent. JSON numbers and `>2` decimal places are both 422.
- The `@tests/http` import has the side-effect of booting the full app, which registers every enabled module's `translatables` — this is why the i18n helpers work without additional setup.
