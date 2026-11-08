---
source: tests/unit/scenarios/scenario-images.test.ts
sha256: 8c6ccec03e7c09aad18f2ad04142fac61ab402d448daa9b97aa48ff2b91be6b5
generated_at: 2026-11-08T10:30:46.184865+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/scenario-images.test.ts

## Purpose

Validates that every `imageUrl` string in the scenario seed dataset is a well-formed URL path that resolves to a file actually shipped under `public/images/seed/`. It exists because nothing else catches a bad image reference: Windows-style backslashes, a missing file, or a path outside the static mount would all surface only as broken images in a browser.

## Key elements

- **`collectImageUrls()`** — Walks every `.ts` file in `scenarios/` (skipping runners), `require`s it synchronously, then recursively traverses each exported array to collect every `imageUrl` string with a human-readable row label. Returns `[label, url][]`.
- **`SCENARIOS_ROOT`** — Resolved path to the `scenarios/` directory relative to this test file.
- **`PUBLIC_ROOT`** — Resolved path to `public/`, the root that `express.static` (in `src/app.ts`) serves; used to map a leading `/` in a URL to a filesystem location.
- **`RUNNER_FILES`** — A `Set` containing `apply.ts` and `run-server.ts`, excluded from the walk because importing them triggers real side effects (Mongo connection, in-memory server boot).
- **`describe('seed row imageUrls')`** — Five assertions: (1) at least 5 URLs collected (guards against a broken walk), (2) no backslashes in any URL, (3) every URL starts with `/`, (4) the file exists at `PUBLIC_ROOT + url`, (5) every URL starts with `/images/seed/`.

## Relationships

- **`scenarios/` directory (imported at runtime):** The test `require`s each data file to read its exported row arrays. It deliberately avoids importing `apply.ts` or `run-server.ts` to prevent their side-effectful top-level code from executing.
- **`src/app.ts` (referenced in comments):** Defines the `express.static` mount that makes a leading `/` in an `imageUrl` mean "rooted at `public/`." The test's existence-path assertion mirrors that routing.
- **`.dependency-cruiser.cjs` (referenced in comments):** Enforces the "unit layer stays database-free" rule elsewhere; this test's `RUNNER_FILES` exclusion is the local, manual enforcement of the same invariant.
- **`tests/cross-cutting/side-effects-have-one-layer.test.ts` / `tests/unit/scripts/mutation/ci/waves.test.ts`:** No direct code-level interaction is visible in this file; they share the dependency graph but do not import or reference each other.

## Notes

- The `require()` call is synchronous by design: Jest runs the suite as CommonJS, and the URL list must be fully materialized before `it.each`-style collection. An async `import()` would yield a promise at the wrong time.
- The recursive walk is intentionally deep (not just top-level array items) because an order row embeds a product snapshot carrying its own independent `imageUrl` copy that can drift from the live product's URL.
- The backslash check does **not** consult `path.sep`; the rule is about URL syntax and must hold identically on every platform.
- `check.ts` is *not* in `RUNNER_FILES` — it only exports pure functions with no top-level side effects, so it is loaded like any other data file.
- The floor assertion (`≥ 5`) is deliberately low: most rows share a small pool of physical image files, so the count is far above the pool size. It exists solely to detect a regression in the walk logic itself.
