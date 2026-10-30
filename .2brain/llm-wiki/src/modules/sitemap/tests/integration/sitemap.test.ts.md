---
source: src/modules/sitemap/tests/integration/sitemap.test.ts
sha256: e281472b56324611343346da472088f4919962e70051347e836f7dcab9717c53
generated_at: 2026-10-29T05:54:33.994333+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/tests/integration/sitemap.test.ts

## Purpose

Integration test suite that exercises the sitemap HTTP endpoints (`/sitemap/index.xml`, `/sitemap/pages.xml`, `/sitemap/products-{n}.xml`) against a real database with all production modules registered. It verifies entry enumeration, language alternates, `x-default` resolution, `lastmod` semantics, per-file URL-limit splitting, and 404 for unlisted files.

## Key elements

- **`beforeEach`** — resets served-language process memory, clears domain events, and re-registers all `enabledModules` so each test starts from a clean, fully-wired app.
- **`givenServedLocale(...args)`** — wraps `givenLocale` (DB write) with `refreshLocaleOverrides()` so the in-memory served-language list actually picks up the new row.
- **`FRONTEND`** — the `http://localhost:8080` origin used in expected URL assertions.
- **`entriesOf(path)`** — GETs a sitemap URL, asserts 200, parses the XML body with the `sitemap` library, and returns typed entries.
- **`filesOf()`** — GETs `/sitemap/index.xml`, parses it as a sitemap index, and returns the child file URLs.
- **`lastmodOf()`** — shorthand for reading the first entry's `lastmod` from `products-1.xml` as a millisecond timestamp.
- **`describe('GET /sitemap/index.xml')`** — checks content-type, cache headers, ordering (pages first), and that an empty catalogue omits the products file.
- **`describe('GET /sitemap/pages.xml')`** — verifies one entry per active language per static page, alternate links, `x-default` fallback when the default locale is deactivated, exclusion of inactive languages, and inclusion of newly activated languages.
- **`describe('GET /sitemap/products-{page}.xml')`** — covers per-product entries with alternates, `lastmod` tied to `updatedAt`, `lastmod` bump on translation edit, `lastmod` stability on stock-only change, exclusion of hidden/soft-deleted products, splitting at `NODE_SITEMAP_URL_LIMIT`, and 404 for unlisted page numbers (parameterised via `it.each`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules.ts` → `enabledModules` | Passed to `registerModules` in `beforeEach`; defines which modules the sitemap sees. |
| `src/kernel/registry.ts` → `registerModules` | Re-binds all module handlers to the app on every test. |
| `src/kernel/events.ts` → `resetDomainEvents` | Clears the event bus so tests don't observe stale events. |
| `src/infrastructure/i18n/index.ts` → `refreshLocaleOverrides` | Called by `givenServedLocale` to sync the in-memory served-language list after a DB write. |
| `src/infrastructure/i18n/served.ts` → `resetServedLanguages` | Called in `beforeEach` to prevent cross-test language leakage (process-memory state). |
| `src/modules/locales/index.ts` / `services/index.ts` → `localeService` | Used to create languages and update entity translations in tests. |
| `src/modules/locales/tests/factories.ts` → `givenLocale` | Seeds a locale row in the test DB. |
| `src/modules/products/tests/factories.ts` → `createProduct`, `readProduct` | Seeds and reads product fixtures. |
| `src/modules/inventory/index.ts` / `services/index.ts` → `inventoryService` | `receive()` call used to verify stock changes do **not** affect `lastmod`. |
| `tests/support/callers.ts` → `testCallerContext` | Auth context passed to `inventoryService.receive`. |
| `tests/support/environment.ts` → `withEnvironmentOverrides` | Scopes env-var changes (`NODE_DEFAULT_LOCALE`, `NODE_SITEMAP_URL_LIMIT`) to a single test. |
| `tests/support/http.ts` → `api` | HTTP client used for all GET requests and status assertions. |

## Notes

- **`givenLocale` alone is insufficient.** It writes only the DB row; the served-language list lives in process memory and requires a subsequent `refreshLocaleOverrides()` call. The local `givenServedLocale` helper exists solely to chain these two steps.
- **20 ms delays before `lastmod` assertions.** `updatedAt` has millisecond resolution; without the delay a read and an immediate write can land in the same millisecond, making a "grew" assertion flaky.
- **`x-default` follows the first *active* language, not the configured default locale.** A dedicated test deactivates the default (`de`) and confirms `x-default` falls back to `en`.
- **Stock changes intentionally do not update `lastmod`.** Only content (translation) edits do; this is an explicit product decision verified by a test.
- **The 404 test is parameterised** with `['2','0','01','abc','-1']` to guard against off-by-one and format-validation bugs in the route matcher.
- **File-limit splitting counts per-language entries.** With 2 active languages and a limit of 4, each product occupies 2 slots, so 5 products yield files of 4, 4, 2 entries.
