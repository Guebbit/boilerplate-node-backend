# tests/unit/db/seed-fixtures.test.ts

## Purpose

Validates that every `imageUrl` string across all module seed fixtures is a well-formed, absolute URL path that resolves to a file actually present under `public/`. It exists because a bad path (e.g. a Windows-style `\images\x.jpg` from `path.join`) produces only a silent 404 in the browser — no other test catches it.

## Key elements

- **`MODULES_ROOT` / `PUBLIC_ROOT`** — Filesystem paths to `src/modules` and `public/`, used for the directory walk and the existence check respectively.
- **`collectImageUrls(): [label, url][]`** — Recursively walks every module's `demo.ts` exports (arrays only), deep-scanning nested objects (including embedded product snapshots inside orders) to gather all `imageUrl` string fields. Returns labelled pairs so failures name the exact fixture.
- **`imageUrls`** — The collected list, computed once at module scope and shared by all `it.each` cases.
- **`describe('seed fixture imageUrls')`** — Five assertions:
  - Collection is non-empty (≥ 5) — guards the walk itself.
  - No backslash characters (URL path, not filesystem path).
  - Starts with `/` (absolute under the static mount).
  - `existsSync` under `public/` (file actually ships).
  - Starts with `/images/seed/` (repository content, not a runtime upload).

## Relationships

- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — This test's design is shaped by the same invariant: it reads raw fixture arrays via `require` rather than calling the `seed*Collection` functions, so importing the data does not trigger the database-connection side effect that `db/demo/index.ts` performs on import. The cross-cutting test enforces that side effect in one layer; this test depends on being able to bypass it.

## Notes

- Uses synchronous `require` (not `await import`) because `it.each` needs the list at collection time and ts-jest runs the suite as CommonJS.
- Discovers modules by walking `src/modules` with `readdirSync` rather than importing three files by name — a new domain is covered by existing; a deleted domain drops out without breaking the suite.
- The walk is intentionally deep: an order embeds a product snapshot that carries its own `imageUrl` copy, which can drift independently of the live product.
- The backslash check uses a literal `/\\/` regex and does **not** consult `path.sep`; the rule is about URL syntax and must hold identically on every platform.
- The floor of 5 in the first test is deliberately low (survives fixture retirement) while still catching a broken traversal that would otherwise let every subsequent assertion pass vacuously.
