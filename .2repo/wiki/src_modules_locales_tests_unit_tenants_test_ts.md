# src/modules/locales/tests/unit/tenants.test.ts

## Purpose

Unit tests for the tenant-registry API in `tenants.ts`. Each test sets `NODE_LOCALE_TENANT_*` environment variables, calls the lazy reader functions, and asserts the parsed tenant list or membership result. The suite exists to pin down the parsing rules (defaults, extra frontends, labels, deduplication) and the frontend/backend/unknown discrimination logic.

## Key elements

- **`beforeEach` / `afterEach`** — Save the three `NODE_LOCALE_TENANT*` env keys into `original`, delete them before each test, and restore them (or delete) after each test to prevent cross-test leakage.
- **`'defaults to the demo pair, the backend first'`** — Verifies the hardcoded fallback: `demo-be` (backend) then `demo-fe` (frontend), and that `backendTenant()` / `frontendTenant()` return the right ids.
- **`'reads the two ids from the environment'`** — Confirms that `NODE_LOCALE_TENANT_BACKEND` / `_FRONTEND` override the defaults.
- **`'adds the extra frontends, labelled or not, and drops a duplicate'`** — Exercises `NODE_LOCALE_TENANTS_EXTRA` parsing: `id=Label` entries, bare ids (label falls back to id), empty entries ignored, duplicate ids dropped.
- **`'tells a frontend tenant from the backend one and from a stranger'`** — Checks `frontendTenantIds()`, `isFrontendTenant()`, and `isKnownTenant()` against backend, extra, and unknown ids.

## Relationships

- **`src/modules/locales/tenants.ts`** — The sole module under test. All six public exports (`backendTenant`, `frontendTenant`, `frontendTenantIds`, `isFrontendTenant`, `isKnownTenant`, `listTenants`) are imported and exercised. The tests treat the module's internal parsing as a black box driven entirely by environment variables.

## Notes

- The env keys are treated as the *only* configuration surface; there is no injection or mock of `process.env`. Tests therefore run in whatever Node environment the suite starts in, which is why `beforeEach`/`afterEach` are mandatory here (a leaked `NODE_LOCALE_TENANTS_EXTRA` would silently add tenants to unrelated tests).
- The `original` snapshot uses `Partial<Record<…>>` so a missing key is represented as `undefined`; `afterEach` distinguishes "was absent" (delete) from "had a value" (restore) rather than unconditionally deleting.
- The extra-tenants string intentionally includes a duplicate of `demo-fe` (`demo-fe=Again`) to assert deduplication by id, not by label.
