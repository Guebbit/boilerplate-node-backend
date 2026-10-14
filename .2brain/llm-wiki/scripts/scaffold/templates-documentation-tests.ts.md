---
source: scripts/scaffold/templates-documentation-tests.ts
sha256: 87246ed20771642721d4f4cd87a795cb4d34388859dc20771d9560c79035387f
generated_at: 2026-10-14T07:31:53.518552+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/templates-documentation-tests.ts

## Purpose

Provides four string-template functions that generate the documentation page and the initial test files for a newly scaffolded module. Called by the scaffold pipeline to emit ready-to-edit Markdown and TypeScript test scaffolds that follow the project's conventions (plain template literals, no backticks in generated comments).

## Key elements

- **`documentationPage(names, options)`** — Returns the `docs/modules/<kebab>.md` page: a "tip" summary box, graph-marker comments (`module-graph:<kebab>:start/end`), a "The story" TODO section, a Mermaid flowchart of the request pipeline (auth → permission → controller → service → repository → entity), and links to related pages. Uses `options.summary` and `options.audit` to interpolate content.
- **`routesTest(names)`** — Returns a Jest unit test asserting: exact endpoint set and order, every route sits below the identity gate with a `requirePermissionGuard`, and `GET /` uses `privateNoCache` rather than a Redis `setCache`.
- **`factoriesTest(names)`** — Returns a Jest unit test for `make<Entity>`: defaults populate `name`, optional `notes` is absent by default, and explicit overrides win.
- **`serviceTest(names)`** — Returns a Jest integration test (real DB via `setupTestDb`) covering: trim-on-create, search, merge semantics (omitted fields preserved, `null` clears), 404 for unknown ids on update/remove, and delete-then-search-returns-empty.

## Relationships

- **`scripts/scaffold/names.ts`** — Supplies the `ModuleNames` type (`kebab`, `entity`, `family`) that all four templates interpolate into their output strings.
- **`scripts/scaffold/options.ts`** — Supplies the `ScaffoldOptions` type (`summary`, `audit`) consumed by `documentationPage` to tailor the generated page.
- **`scripts/scaffold/plan.ts`** — Upstream orchestrator that imports these four exports and writes their returned strings to disk as part of the scaffold plan execution.

## Notes

- All templates are plain backtick template literals; any backtick that must appear in the *generated* output is escaped as `` \` `` (visible in the documentation page's code-fence examples).
- The documentation page includes `<!-- module-graph:...:start/end -->` HTML comments that an external `docs:graph` process fills in—do not remove them or the graph renderer will skip the module.
- `serviceTest` depends on test helpers (`asReject`, `asSuccess`, `MISSING_ID`, `setupTestDb`) that must already exist in the repo before the generated test compiles.
- The route test asserts a **fixed** five-endpoint REST shape; if a module legitimately deviates, the generated test must be edited after scaffolding.
