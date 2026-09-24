---
source: src/modules/locales/tests/unit/tenants.test.ts
sha256: 9c18714e2146b8bd1e3650ace9b24c90154f2f89c7ed7b2c93077907d9944ee6
generated_at: 2026-09-23T18:54:58.471537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/tenants.test.ts

## Purpose

Unit tests for the tenant registry in `tenants.ts`. Verifies that the six exported readers (`listTenants`, `backendTenant`, `frontendTenant`, `frontendTenantIds`, `isFrontendTenant`, `isKnownTenant`) behave correctly against the three `NODE_LOCALE_TENANT*` environment variables, including default values, custom overrides, extra-tenant parsing, and classification.

## Key elements

- **`KEYS`** – tuple of the three env-var names the suite manages.
- **`beforeEach` / `afterEach` hooks** – snapshot then clear the three variables before each test; restore the exact pre-suite state afterwards. This prevents a leaked `NODE_LOCALE_TENANTS_EXTRA` from polluting unrelated contract tests.
- **`describe('the tenant registry')`** – four cases:
    - _defaults to the demo pair_ – asserts the hard-coded `demo-be` / `demo-fe` fallback.
    - _reads the two ids from the environment_ – sets `NODE_LOCALE_TENANT_BACKEND` / `_FRONTEND` and checks the returned ids.
    - _adds the extra frontends, labelled or not, and drops a duplicate_ – exercises `NODE_LOCALE_TENANTS_EXTRA` parsing (labels, bare ids, empty tokens, duplicate of the default frontend).
    - _tells a frontend tenant from the backend one and from a stranger_ – covers `frontendTenantIds`, `isFrontendTenant`, `isKnownTenant`.

## Relationships

- **`src/modules/locales/tenants.ts`** – sole import target. Every assertion in this file exercises one of its six exported functions; the test file itself exports nothing.

## Notes

- The duplicate-removal case is important: `demo-fe` appears both as the default frontend and inside the extras string, but the result lists it exactly once.
- Extras parsing tolerates arbitrary surrounding whitespace and empty tokens (e.g. `,,`), and a label is optional (bare `kiosk` falls back to the id as its label).
- The save/clear/restore pattern in the hooks is deliberate: simply `delete`-ing in `afterEach` would lose a value the _suite_ itself had set before any test ran.
