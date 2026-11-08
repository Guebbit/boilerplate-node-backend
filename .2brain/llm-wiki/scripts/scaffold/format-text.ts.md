---
source: scripts/scaffold/format-text.ts
sha256: 22ff161db342470af801a19657cced646b582e440d4a8fae2353bc17b8b70fa5
generated_at: 2026-11-08T02:59:32.657586+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/format-text.ts

## Purpose

Provides a single formatting seam (`FormatText`) so scaffold scripts can produce Prettier-conformant output without importing Prettier directly. The real implementation lives in this file; tests substitute an identity formatter to sidestep Prettier's dynamic-import requirements that Jest cannot satisfy.

## Key elements

- **`FormatText`** (type) — `(root: string, file: string, content: string) => Promise<string>`. The injectable contract every consumer imports; callers pass an implementation, so the module is swappable in tests.
- **`formatWithRepoConfig`** (const, implements `FormatText`) — The production formatter. It:
  1. Checks `.prettierignore` via `getFileInfo`; returns `content` unchanged if the file is ignored.
  2. Resolves per-file config with `resolveConfig` (including `.editorconfig`, which the Prettier API skips by default).
  3. Calls `format` with the resolved options plus `filepath` (so the parser is inferred from extension).

## Relationships

- **scripts/scaffold/apply.ts**, **scripts/scaffold/demo-remove.ts**, **scripts/scaffold/scaffold-module.ts**, **scripts/scaffold/scenario-registry.ts** — Scaffold scripts that consume the `FormatText` type (and likely `formatWithRepoConfig`) to format generated files before writing them.
- **scripts/contracts/generate-shared-rule-schemas.ts**, **scripts/docs/generate-scenario-registries.ts** — Generator scripts that format their output through the same `FormatText` seam.
- **tests/unit/scripts/scaffold/apply.test.ts** — Exercises `apply.ts` by injecting an identity `FormatText` in place of `formatWithRepoConfig`, avoiding the Prettier dependency entirely.

## Notes

- The `editorconfig: true` flag in `resolveConfig` is deliberate: the Prettier CLI reads `.editorconfig` automatically, but the API does not. Omitting it would produce output that diverges from `prettier:check`.
- The `.prettierignore` guard matters for hand-formatted shared files that the repo intentionally excludes from reformatting; without it a one-line edit would reflow the entire file.
- Callers should treat `FormatText` as the injection point, not `formatWithRepoConfig` directly, so tests can substitute a no-op formatter.
