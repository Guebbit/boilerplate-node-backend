---
source: scripts/scaffold/templates-documentation-tests.ts
source_sha256: d1d7225ab6606b99410c29c75e92234a1049d41d4d6f39ff99ceeaa7c4383eba
context_sha256: 51ceba97045732b8eaea0b0ccc72d9443f080e732369f411456ccb07d64f1f23
generated_at: 2026-11-22T02:17:30.051539+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/templates-documentation-tests.ts

## Purpose
Holds the template-literal generators for the documentation page and the smoke/unit/integration/contract tests of a newly scaffolded module. Each export takes the module's name spellings (and, for the docs page, the scaffold options) and returns the file text that the scaffolder writes. It exists to keep these generated files out of the runtime templates while following the same conventions: plain template literals and no backticks in generated comments.

## Key elements
- `documentationPage(names, options)` — returns the module's Markdown page for `docs/modules`. It includes front matter, an "At a glance" tip with TODOs, empty `module-graph:<kebab>` and `permissions` marker blocks (which `regenerate` fills), a "story" section, a Mermaid pipeline diagram, and "Read next" links. The diagram adds an "records an audit row" note on the service node only when `options.audit` is set.
- `routesTest(names)` — generates a route-table test. It asserts the exact list of mounted routes (`GET /`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id`). Every route must sit below the identity guard and carry `requirePermissionGuard`. The list route must use `privateNoCache` and no `setCache*` middleware. It mocks the cache and rate-limit middlewares via `@tests/routes`.
- `factoriesTest(names)` — tests `make<Entity>`: a default name, `notes` absent by default, and overrides winning.
- `domainTest(names)` — tests `<entityCamel>ActionsFor`, which should echo the `update`/`delete` permission keys across all four combinations.
- `serviceTest(names)` — an integration test of the service against a real DB (`setupTestDb`). It covers:
  - name trimming on create;
  - the `actions` field on results, checked for admin and guest callers;
  - list/search;
  - getById;
  - merge-versus-null-clear on update;
  - 404 (or null for a read) for a missing id;
  - removal.
- `contractTest(names)` — generates an HTTP contract test for `names.basePath`, judged against `openapi.yaml`. It starts with a `createViaApi` helper and a `POST` case expecting 201, a `Location` header and `actions`. The remainder of the file is not visible here.

## Relationships
- `names.ts` — supplies the `ModuleNames` type (`kebab`, `entity`, `entityCamel`, `basePath`) interpolated throughout the templates.
- `options.ts` — supplies the `ScaffoldOptions` type. Only `documentationPage` reads it (`summary`, `audit`).
- `plan.ts` — a graph neighbor. The visible content shows no direct reference to it, so it presumably consumes these generators when assembling the scaffold plan.

## Notes
- The generated code is inside template literals, so backticks and `${` in the output are escaped (`` \` ``, `\${`). Keep that escaping when editing.
- The generated tests import helpers from the `@tests/*` aliases (`routes`, `setup-test-db`, `callers`, `ids`, `response`, `http`, `contract`) and from `@modules/<kebab>/...`. They assume those aliases and the module's `routes`, `factories`, `domain` and `services` files exist.
- The generated contract-test header says that 401/403 cases are deliberately left to the shared authorization sweep in `tests/contract/authorization-contract.test.ts`.
- The generated route test uses positional assertions on purpose, so it fails if routes are reordered.
