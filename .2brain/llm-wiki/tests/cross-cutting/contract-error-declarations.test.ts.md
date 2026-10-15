---
source: tests/cross-cutting/contract-error-declarations.test.ts
sha256: 0d8dae304345a23c455b91b4c44f8fa375e59ff0846290aab213c8216d9da4a1
generated_at: 2026-10-15T12:36:48.030746+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-error-declarations.test.ts

## Purpose

Guards the per-module OpenAPI fragments against a missing `404` response on any operation whose path template carries an id parameter. Because the contract is a shared artifact (bundled, consumed by a generated frontend client, and mirrored in a PHP twin), an undeclared status is a hard integration break, not a documentation gap. The test reads the source fragments directly so a failure names the file a developer actually edits.

## Key elements

- **`METHODS`** — `Set` of the five HTTP verbs recognised as operation keys in an OpenAPI path item.
- **`TAKES_AN_ID`** — regex (`/{[^}]*[Ii]d}/`) matching any path template parameter whose name contains `id`; used as the trigger for the assertion rather than a hardcoded route list.
- **`Operation`** (interface) — `{ module, route, method, codes }` shape returned by the sweep.
- **`operations()`** — reads every `<module>/openapi.yaml` under `MODULES_ROOT`, parses it with `yaml`, and flat-maps all method-keyed operations with their declared response codes.
- **`takingAnId()`** — filters `operations()` to those whose route matches `TAKES_AN_ID`.
- **`describe('declared error responses')`** — the test suite:
  - *Canary case* — asserts `operations().length > 40` and `takingAnId().length ≥ 20` so a renamed fragment or restructured path shape doesn't let the real assertion pass vacuously.
  - *Main case* — asserts no id-taking operation is missing `404` in its declared responses; failures list `module: METHOD route` with an explanatory suffix.

## Relationships

- **`tests/support/paths.ts`** — supplies the `MODULES_ROOT` constant; the test uses it as the base directory to discover per-module `openapi.yaml` fragments.
- **`package.json`** — provides the `yaml` and `node:fs`/`node:path` dependencies and the `@tests/paths` import alias.

## Notes

- Scope is **404 on a path id only**. The 422 case for malformed ids in a body or query is covered separately by `tests/integration/malformed-ids.test.ts`.
- A 500 sweep was run but the three hits (`GET /account`, `GET /observability/events`, `GET /observability/metrics`) are **deliberately excluded** from this test; resolving them requires editing a file that must move in lockstep across three repositories.
- The test reads fragments, **not** the generated bundle, so error messages point at the file a developer edits.
- The canary test is load-bearing: without it, a rename or schema restructuring would make `takingAnId()` return `[]`, and the 404 assertion would pass while checking nothing.
