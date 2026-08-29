# tests/unit/db/seed-fixtures.test.ts

## Purpose

Validates that every `imageUrl` in the seed/demo fixture data is a well-formed URL path that resolves to a file actually shipped in the repository under `public/`. It exists because a bad URL (Windows backslashes, a missing file, a path outside the static mount) produces only a silent 404 in the browser with no other test to catch it.

## Key elements

- **`MODULES_ROOT` / `PUBLIC_ROOT`** — filesystem paths resolved relative to the test file, pointing at `src/modules/` and `public/` respectively.
- **`collectImageUrls()`** — Synchronously `require`s every `src/modules/*/demo.ts`, deep-traverses all exported arrays, and returns a flat `[label, url][]` of every `imageUrl` string found. The deep walk handles nested structures (e.g. an order's embedded product snapshot carrying its own `imageUrl`).
- **`imageUrls`** — The collected pairs, evaluated once at module-load time and fed into `it.each`.
- **`describe('seed fixture imageUrls')`** — Five assertions applied to every collected URL:
  - Collection is non-empty (≥ 5), guarding against a silent traversal regression.
  - No backslash characters (URL path, not filesystem path).
  - Starts with `/` (absolute, rooted at the express static mount).
  - The file exists at `public/<url>` on disk.
  - Starts with `/images/seed/` (distinguishes committed fixtures from gitignored runtime uploads).

## Relationships

No graph neighbors are tracked for this file. It reads fixture data from `src/modules/*/demo.ts` at runtime via `require`, but those are dynamic filesystem lookups, not static imports.

## Notes

- **Synchronous `require` by design.** ts-jest compiles to CommonJS, so `require` of a `.ts` module resolves in place. An async `import` would return a promise that `it.each` cannot consume. An ESLint disable for `@typescript-eslint/no-require-imports` marks this as intentional.
- **Discovery, not enumeration.** The test walks `src/modules/` with `readdirSync` rather than importing a fixed list of modules. A new domain with images is guarded automatically; removing a domain removes its fixtures from the sweep instead of breaking the test.
- **Cannot go through `seed*Collection`.** `db/demo/index.ts` performs a database write on import, so the test must read the raw fixture arrays directly. This is why each module exports its fixture arrays separately from the seed function.
- **The ≥ 5 floor** is deliberately low (currently 7 images: 5 products + 2 users) so that retiring one fixture doesn't break the guard, while still catching a completely broken traversal.
- **Backslash check is platform-independent.** The assertion `not.toMatch(/\\/)` does not consult `path.sep`; the rule is about URL syntax, which is identical on every OS.
