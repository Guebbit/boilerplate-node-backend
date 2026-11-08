---
source: src/modules/locales/tests/contract/translations.contract.test.ts
sha256: d568e5b039a6016699d2d949547d1b35d49cdd23e42869e02e4d0f31ab33662a
generated_at: 2026-11-08T06:27:30.027110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/contract/translations.contract.test.ts

## Purpose

Contract tests for the `/locales/translations/:entityType/:id` endpoint (GET, PATCH, PUT). The suite is deliberately scoped to the `product` entity type so that removing the shop module deletes exactly this file without touching the language or dictionary contract suites.

## Key elements

- **`describe('GET & PATCH …')`** — covers empty-list GET, PATCH upsert with `origin`, 422 on missing `origin`, 404 on unregistered entity type, prototype-pollution guard (`constructor`, `toString`, `__proto__`), and 422 on a `null` locale value.
- **`describe('PUT …')`** — covers full-replace semantics: locales absent from the body are deleted, `origin` defaults to `'human'` when omitted, and a 422 when the fallback locale (`en`) is not in the body.
- **`FALLBACK`** — module-level constant `{ tag: 'en', name: 'English', nativeName: 'English' }` passed to `createLanguage` so the English row exists in the test DB before any PUT assertion.
- **`setupTestDb()`** — called once at module scope to reset the database before the suite runs.

## Relationships

- **`./support`** (`src/modules/locales/tests/contract/support.ts`) — supplies `createLanguage`, which registers a language row in the test DB and returns the created document.
- **`@modules/products/tests/factories`** — supplies `createProduct`, which creates a minimal product row to serve as the translation target.
- **`@tests/contract`** (`tests/support/contract.ts`) — imported for its side effects; likely registers global contract-test helpers or assertions.
- **`@tests/http`** (`tests/support/http.ts`) — supplies `api` (supertest-style request builder) and `authenticateAs` (returns a bearer token for a named role).
- **`@tests/setup-test-db`** (`tests/support/setup-test-db.ts`) — supplies `setupTestDb` for per-file database isolation.

## Notes

- PATCH and PUT treat `origin` differently: PATCH *requires* it on every locale entry (422 if missing); PUT defaults it to `'human'` when omitted.
- PUT is a **replace**, not an upsert — any locale row not keyed in the request body is deleted from the entity.
- The `it.each` prototype-pollution cases verify that inherited `Object` properties are rejected as entity types, returning 404 rather than 422.
- The `@tests/contract` import is a bare side-effect import (no named binding); it must not be removed during tree-shaking refactors.
