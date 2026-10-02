---
source: scripts/scaffold/templates-documentation-tests.ts
sha256: 4ac25da1b7fd05b5b86b6ba284aeb959fb4ffecb0f0a0c84c2ee724371a9be94
generated_at: 2026-10-01T12:40:39.605351+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-documentation-tests.ts

## Purpose

Provides the text templates that a module scaffold writes for a new module's documentation page (under `docs/modules/`) and its three test files (routes, factories, service). The templates are plain template literals that interpolate module naming and scaffold options, producing ready-to-commit Markdown and TypeScript with no further post-processing.

## Key elements

- **`documentationPage(names, options)`** — Returns a full Markdown page with an "At a glance" callout, a `module-graph` marker pair for the graph tool, a "story" section, and a Mermaid pipeline diagram reflecting the standard admin→gate→permission→controller→service→repository→entity flow. Conditionally adds an audit annotation when `options.audit` is truthy.
- **`routesTest(names)`** — Returns a Jest spec that asserts the exact endpoint list and order, verifies every route sits below the identity/permission gate, and confirms the list endpoint uses `privateNoCache` rather than a Redis `setCache`.
- **`factoriesTest(names)`** — Returns a Jest spec for the `make<Entity>` fixture builder: default values apply, overrides win, absent optionals stay absent.
- **`serviceTest(names)`** — Returns a Jest integration spec (real DB via `setupTestDb`) covering create-trim, list, merge semantics (omitted stays, `null` clears), 404 for missing IDs, and delete-then-verify-empty.

## Relationships

- **`scripts/scaffold/names.ts`** — Imports the `ModuleNames` type; every template interpolates `names.kebab`, `names.family`, and `names.entity` to produce correctly-spelled identifiers and paths.
- **`scripts/scaffold/options.ts`** — Imports the `ScaffoldOptions` type; `documentationPage` reads `options.summary` and `options.audit` to customise the generated page.
- **`scripts/scaffold/plan.ts`** — Listed as a graph neighbor but no import appears in this file; `plan.ts` is most likely the consumer that calls these four templates during the scaffold run.

## Notes

- The module docblock and every generated docblock follow the project convention: "no backticks in generated comments." Inside template literals, any literal backtick that should appear in output is escaped as \` (visible in the generated code).
- `routesTest` deliberately uses positional `toEqual` on the full signature array rather than per-route middleware checks, so reordering routes fails the test even if each individual guard is still present.
- The Mermaid diagram hard-codes the `feedback` module's admin-half pattern as the starting template; it is not parameterised beyond `names.family`, `names.entity`, and the optional audit annotation.
- `documentationPage` leaves a `<!-- module-graph:…:start -->` / `:end` marker pair; the `docs:graph` tool is expected to fill the gap between them post-scaffold.
