---
source: scripts/scaffold/templates-documentation-tests.ts
sha256: 625800ca5e67fd1d9e8644f3782819067f30ca25fb357720ceaa46bf8fe11097
generated_at: 2026-11-08T03:01:33.171760+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-documentation-tests.ts

## Purpose

Provides the documentation-page skeleton and the full set of smoke/integration test templates that the scaffold generator writes out when creating a new module. Each export is a plain template-literal function that, given a module's naming info and scaffold options, returns the final Markdown or TypeScript source to be placed in the new module's directory.

## Key elements

- **`documentationPage(names, options)`** – Returns the Markdown text for `docs/modules/<kebab>.md`, including the `::: tip` summary block, graph-marker comment pairs (`module-graph`, `permissions`), a Mermaid pipeline diagram (audit annotation is conditional on `options.audit`), and a "Related pages" link list.
- **`routesTest(names)`** – Returns a Jest test file asserting the exact route table, that every route sits below the identity/permission gate, and that the list endpoint uses `privateNoCache` (no Redis write-cache).
- **`factoriesTest(names)`** – Returns a Jest test for `make<Entity>`: default values apply, overrides win, absent optionals stay absent.
- **`domainTest(names)`** – Returns a Jest test for `<EntityCamel>ActionsFor`, verifying the function echoes the permission keys it receives.
- **`serviceTest(names)`** – Returns a database-backed integration test covering create/trim, merge semantics (omitted vs. `null`), 404 vs. `null` for missing ids, and delete-then-verify-empty.
- **`contractTest(names)`** – Returns an HTTP contract test (superagent + OpenAPI) exercising each route's declared status codes, `Location` header, and `actions` payload. Delegates 401/403 coverage to the shared authorization sweep.

## Relationships

- **`scripts/scaffold/names.ts`** – Supplies the `ModuleNames` type (`kebab`, `entity`, `entityCamel`, `basePath`) consumed by every template function.
- **`scripts/scaffold/options.ts`** – Supplies the `ScaffoldOptions` type (`summary`, `audit`) consumed by `documentationPage`.
- **`scripts/scaffold/plan.ts`** – The orchestrating caller that invokes these template functions and writes the resulting strings to disk during a scaffold run.

## Notes

- All generated comments and strings use plain template literals; backticks are **never** emitted inside the generated output (the file's own JSDoc states this convention explicitly). Where a backtick is needed in the generated text (e.g., the Mermaid block delimiters, inline code), it is escaped as `` \` ``.
- The `documentationPage` graph markers (`module-graph:<kebab>:start/end`, `permissions:start/end`) are placeholders that the separate `regenerate` tool fills in; they are not resolved at scaffold time.
- `contractTest` intentionally omits per-route 401/403 assertions, relying on `tests/contract/authorization-contract.test.ts` for that sweep—do not add them per-module.
- The pipeline Mermaid diagram hard-codes the six CRUD endpoints; if a future scaffold variant drops or adds routes, the diagram and `routesTest` expectations must be updated together.
