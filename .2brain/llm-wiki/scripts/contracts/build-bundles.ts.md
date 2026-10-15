---
source: scripts/contracts/build-bundles.ts
sha256: 1fa9f81cbf0c1ca2878ec9c2741842086f60b04b8da7c2f55f647e9e003c8a7f
generated_at: 2026-10-15T09:36:07.843241+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/build-bundles.ts

## Purpose

CLI entry point (`npm run contracts:bundle`) that rebuilds the repo's contract bundles (OpenAPI, AsyncAPI, public AsyncAPI) from their source fragments, or verifies they are current with `--check`. Fragments are the source of truth; the bundled files are what Spectral, Orval, Prism, and `check:spec-identity` consume. Client collections (Orval, Prism, Bruno, etc.) are opt-in and generated from the committed `openapi.yaml` rather than from fragments.

## Key elements

- **`arguments_` / `checkOnly` / `named`** — Parsed CLI state: the `--check` flag and any positional bundle names.
- **`unknown`** — Validation pass; exits with code 2 and lists known bundle names if the caller misspells one.
- **`bundle(bundles)`** — Assembles each bundle via `assembleBundle`, compares the result to what is committed on disk, writes only the ones that drifted (unless `--check`), and returns the stale set.
- **`report(total, stale, problem, advice)`** — Central success/failure messaging. Under `--check`, any stale bundle triggers `fail()` (exit 1); otherwise it logs what was written or confirms nothing changed.
- **`run()`** — Main async logic. If bundles are named, processes exactly those (and refuses `--check` on generated ones). If no names are given, processes only the authored (non-generated) bundles.
- **Entry point** — `run().catch(...)` prints the error and exits 1 on any unhandled rejection.

## Relationships

- **`scripts/contracts/bundle-registry.ts`** — Primary dependency. Supplies `CONTRACT_BUNDLES`, `findBundle`, `assembleBundle`, `isGenerated`, `readCommittedBundle`, and the `ContractBundle` type. All bundle assembly and staleness checks delegate to this module.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, used to render bundle output paths relative to the repo root in log messages.
- **`scripts/mutation/ci/cli.ts`** — Downstream consumer (per the file's docstring). The `--check` mode is designed to be wired into CI as a staleness gate; the explicit refusal of `--check` on generated bundles exists to avoid a permanently red CI gate.

## Notes

- `openapi.yaml` is **gitignored** and rebuilt on every install; `asyncapi.yaml` and `asyncapi.public.yaml` remain **committed**. This asymmetry is the reason `--check` is meaningful for some bundles but not others.
- Client collections are **opt-in by name** (e.g. `npm run contracts:bundle -- bruno`). A full run (no names) intentionally skips them to avoid writing uncommitted files nobody asked for.
- Selection logic lives in this script rather than in `package.json` because npm appends `--` arguments to the **last** command in a `&&` chain only, which would silently drop flags.
- Exit codes: **2** = usage error (unknown bundle name); **1** = stale bundles or runtime failure; **0** = success.
- Authored bundles are stated to be byte-identical with a paired repository; the `report` advice reminds the operator to copy the result over.
- The trailing-underscore name `arguments_` avoids shadowing the global `arguments` object in non-module scope.
