---
source: src/modules/locales/tests/contract/translations.contract.test.ts
sha256: e36668f0163996c0ebe31a20c742add68a32088ed6ec973275db87c61acfcd2b
generated_at: 2026-10-15T10:47:35.015896+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/translations.contract.test.ts

## Purpose

Contract tests for the `/locales/translations` endpoint (GET, PATCH, PUT) that verify an entity's translated fields are read and written correctly through registered entity types. Because `products` is the only registered entity type today, this file is kept separate from the other `/locales` contract suites so that removing the shop module removes this file without touching the language or dictionary tests.

## Key elements

- **`describe('GET & PATCH /locales/translations/:entityType/:id')`** — covers the read (empty list) and upsert paths, plus edge cases: 404 for unregistered entity types, 404 for prototype-pollution names (`constructor`, `toString`, `__proto__`), 422 for a `null` fallback locale, and 401 without auth.
- **`describe('PUT /locales/translations/:entityType/:id')`** — covers the replace semantics: locales not named in the body are deleted, and the request is rejected (422) when the fallback locale is omitted.
- **`FALLBACK`** (local const inside the PUT block) — the `en` locale object registered via `createLanguage` because PUT validates every slot, including the fallback, against a real `locales` row.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`import '@tests/contract'`) to register the contract-test harness.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database before the suite runs.
- **`tests/support/http.ts`** — provides `api()` (request builder) and `authenticateAs()` (bearer-token helper).
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates the entity whose translations are exercised.
- **`src/modules/locales/tests/contract/support.ts`** — `createLanguage(bearer, …)` registers a language row needed for upsert/replace assertions.

## Notes

- The file is intentionally scoped to `products` as the entity type. Do not add cases for other entity types here; the separation exists so the shop removal is a single-file delete.
- The PUT tests must register both `en` (fallback) **and** `pt` before exercising replace, because nothing earlier in the suite creates an `en` row and PUT rejects a body that omits the fallback locale.
- The prototype-pollution `it.each` cases (`constructor`, `toString`, `__proto__`) verify that inherited property names are treated as unregistered types and return 404 rather than 400 or a crash.
