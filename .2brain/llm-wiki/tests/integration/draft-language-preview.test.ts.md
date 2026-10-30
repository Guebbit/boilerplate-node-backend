---
source: tests/integration/draft-language-preview.test.ts
sha256: 6ec056a2d7b8672001c246765d54fe552508c839d648917583298b3df43ae397
generated_at: 2026-10-29T06:54:53.251465+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/draft-language-preview.test.ts

## Purpose

Integration suite proving that a staff credential holding `display:Locale` **without** `display:Product` can preview a draft translation of product text, and that the preview bypasses the shared Redis cache in both directions: it neither reads from nor writes into the entry that anonymous visitors share. Every case drives the real HTTP routes against an in-memory cache double, and a canary test confirms the double *would* have shared the entry, so the bypass assertions are not vacuous.

## Key elements

- **Cache double** (`jest.mock('@infrastructure/adapters/cache')`) — in-memory `Map`-based substitute exposing `storedValues()` and `clearStored()` as test-only handles.
- **`givenDraftGerman(fields?)`** — seeds an inactive `de` locale, a product with a live English title, and a draft German row (default title `Hundekorb`); returns the product id.
- **`asking(language, bearer?)`** — builds `Accept-Language` / `Authorization` headers for a request.
- **`READS`** — constant array describing three catalogue endpoints (`GET /products`, `POST /products/search`, `GET /products/:id`) with their `read` call and `titleOf` body extractor; consumed via `it.each`.
- **`describe('a staff credential …')`** — the positive suite: canary (cache *is* shared for a live language), per-endpoint draft bypass, cold-cache ordering, field-by-field fallback, conditional-request (no 304), draft-only search hit, and non-first-choice language fallthrough.
- **`describe('everyone else asking for the draft')`** — negative: anonymous and customer callers get the live pick and the shared cache.
- **`describe('the oracle')`** — after activating `de` via `POST /locales/de/activate`, a visitor's body is deep-equal to the earlier preview body.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory DB before all tests.
- **`tests/support/http.ts`** — `api()`, `authenticateAs`, `authenticateAsRole` provide the HTTP client and role tokens.
- **`tests/support/credentials.ts`** — `credentialHolding(['display:Locale'])` mints a token with exactly that scope.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the product fixture.
- **`src/modules/locales/tests/factories.ts`** — `givenLocale` creates the `en` and `de` locale rows.
- **`src/modules/locales/repository.ts`** — `translationRepository.upsertEntityLocale` writes the draft German row.
- **`src/modules/locales/services/index.ts`** — `localeService.readLocaleOverlay` is registered as the override provider in `beforeAll`.
- **`src/infrastructure/i18n/index.ts`** — exports `registerLocaleOverrideProvider`, `refreshLocaleOverrides`, `resetLocaleOverrides` used in lifecycle hooks.

## Notes

- The `jest.mock` factory runs before any import; the test-only handles (`storedValues`, `clearStored`) are retrieved via `jest.requireMock` and typed locally.
- The canary test is load-bearing: if the cache double were accidentally isolated per-credential, all bypass tests would pass trivially. The canary asserts the double *does* share across caller identities for a live language.
- Preview responses must carry `cache-control: private, no-store` and must **not** include a `cache-status` header; the suite asserts both.
- `beforeEach` calls `cacheDouble.clearStored()` to guarantee isolation between tests without relying on test ordering.
- The "oracle" test uses `authenticateAs('admin')` to activate the locale, then compares `visitor.body` to `preview.body` with `toEqual` — a strict structural equality, not just title match.
