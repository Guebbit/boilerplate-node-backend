---
source: tests/cross-cutting/side-effects-have-one-layer.test.ts
sha256: c506c5390a5b6307cbb31c2ad476bd9de193d55d58ee8c4365fdc1fa13dc6389
generated_at: 2026-09-23T20:00:33.950061+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/side-effects-have-one-layer.test.ts

## Purpose

A cross-cutting structural test that enforces a single publishing layer (the service layer) for four domain side effects—`enqueueEmail`, `recordAudit`, `emitAnalyticsEvent`, and `emitDomainEvent`—across all of `src/modules`. It exists because the violation is a _set-level_ property (the same fact emitted from different layers in different files) that no per-file lint rule can detect.

## Key elements

- **`moduleFiles()`** – Recursively walks `src/modules` collecting every `.ts` file, skipping `tests/` directories (specs emit freely).
- **`layerOf(file)`** – Classifies a file into a `Layer` (`controller | service | repository | model | routes | domain | other`) purely from its path relative to the modules root.
- **`EXPECTED_LAYER`** – The intended layer for each of the four markers. All four are `'service'`. This is an _intention_, not a measurement of the current tree.
- **`ALLOWED_ELSEWHERE`** – Explicit, sentence-justified exceptions keyed by `<marker> @ <module/path>`. Covers login observability, the account reset-request controller, and the two-factor email method handler.
- **`callSites()`** – Strips block/line comments, then regex-matches each marker as a call (not an import or doc mention) across every module file; returns a `Map<marker, {file, layer}[]>`.
- **`describe` block** – Four tests: (1) canary that at least one call site exists per marker, (2) no stray call sites outside the expected layer or the allowlist, (3) no stale allowlist entries whose file no longer emits, (4) the `EXPECTED_LAYER` table only names valid `Layer` values.

## Relationships

- **`src/modules/addresses/factories.ts`** – Falls within the `moduleFiles()` sweep; the test reads its source and checks whether it calls any of the four markers from the correct layer.
- **`src/modules/account/tests/unit/two-factor.test.ts`** – Explicitly _excluded_ by the `tests/` directory filter in `moduleFiles()`; the test does not inspect it.
- **`scripts/contracts/asyncapi-bundles.ts`** and **`tests/unit/scenarios/scenario-images.test.ts`** – Outside the `src/modules` root; not read or asserted upon by this test.

## Notes

- The comment-stripping regex (`replaceAll` with non-greedy block + line patterns) runs _before_ the marker match so that a docblock mentioning `enqueueEmail` is not counted as a call site.
- `ALLOWED_ELSEWHERE` keys are `<marker> @ <path>` to prevent one marker's exception from silently covering another in the same file.
- The canary test (test 1) exists specifically so that a regex regression or path-change doesn't silently zero out the sweep and make the real assertion a no-op.
- `layerOf` treats `services/` (folder) and `service.ts` (file) as the same layer; a module that reorganizes into a folder does not thereby gain a new permitted emit site.
