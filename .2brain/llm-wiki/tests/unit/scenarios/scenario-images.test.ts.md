---
source: tests/unit/scenarios/scenario-images.test.ts
sha256: 8c6ccec03e7c09aad18f2ad04142fac61ab402d448daa9b97aa48ff2b91be6b5
generated_at: 2026-09-23T20:29:30.084111+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/scenario-images.test.ts

## Purpose

Guards every `imageUrl` in the scenario seed dataset: asserts each value is a forward-slash URL path rooted at `/images/seed/` that resolves to a file actually shipped under `public/`. Without this check, a Windows-style backslash or a missing file surfaces only as "images are broken" in the browser, with no build or CI signal.

## Key elements

- **`RUNNER_FILES`** (`Set<string>`) — names the two `scenarios/` files (`apply.ts`, `run-server.ts`) whose `require()` triggers a live Mongo connection. They are skipped during the walk to keep the suite database-free.
- **`collectImageUrls()`** — Synchronously `require`s every remaining `.ts` data file in `scenarios/`, then recursively walks each exported array to extract every `imageUrl` string, labelling each with its full row path (e.g. `products.products[2]`). Returns `[label, url][]`.
- **`imageUrls`** — The result of `collectImageUrls()`, evaluated once at module load.
- **`describe('seed row imageUrls')`** — Five assertions:
    - _collects a url from every row_ — floor check (≥ 5) so a broken walk can't vacuously pass.
    - _is a URL path, not a filesystem path_ — no `\` anywhere.
    - _is rooted at the static mount_ — must start with `/`.
    - _points at a file that ships_ — `existsSync` under `public/`.
    - _lives under /images/seed/_ — excludes runtime uploads that `.gitignore` drops.

## Relationships

- **`tests/cross-cutting/side-effects-have-one-layer.test.ts`** — This file enforces the same invariant that the cross-cutting test codifies project-wide: unit-layer code must not open a database connection. The `RUNNER_FILES` exclusion and the synchronous `require` of data-only modules are the local mechanism that keeps this suite within that layer.

## Notes

- The `require` call is intentionally synchronous and CommonJS (ts-jest runtime). An `import` or dynamic `import()` would return a promise and break the collection step. The ESLint disable is load-bearing, not stylistic.
- The walk is recursive (not shallow) because an order row embeds a product snapshot that carries its _own_ `imageUrl` copy, which can drift independently from the live product's URL.
- Offenders are collected into an array and asserted with `toEqual([])` rather than using `it.each` per row; the original defect affected a handful of distinct photos across hundreds of rows, and a single grouped assertion is both clearer and faster to diagnose.
- `check.ts` is _not_ in `RUNNER_FILES` because it only exports pure functions and has no side effect on import; it passes through the ordinary `Array.isArray` filter.
