---
source: scripts/scaffold/format-text.ts
sha256: 22ff161db342470af801a19657cced646b582e440d4a8fae2353bc17b8b70fa5
generated_at: 2026-10-01T12:38:50.303158+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/format-text.ts

## Purpose

Provides the single formatting step used when scaffolding code into the repo. It wraps the Prettier API to replicate CLI behavior (`.editorconfig`, `.prettierignore`) so scaffolded output passes `prettier:check` without a second pass. The module is designed as a seam: unit tests can substitute an identity formatter instead of loading Prettier.

## Key elements

- **`FormatText`** (type) — Function signature `(root, file, content) => Promise<string>`. The contract both the real formatter and any test stub must satisfy.
- **`formatWithRepoConfig`** (const, satisfies `FormatText`) — Checks `.prettierignore` via `getFileInfo`; if the file is ignored, returns `content` unchanged. Otherwise resolves Prettier config with `editorconfig: true`, then calls `format` with the resolved options and the file path (which selects the parser).

## Relationships

- **`scripts/scaffold/apply.ts`** — Consumes `formatWithRepoConfig` (or the `FormatText` seam) to format generated content before writing it to disk.
- **`scripts/scaffold/scaffold-module.ts`** — Same consumer role; uses the formatter when producing scaffolded module files.
- **`tests/unit/scripts/scaffold/apply.test.ts`** — Exercises the seam by injecting an identity `FormatText` implementation, sidestepping Prettier's dynamic-import requirement.

## Notes

- The `FormatText` seam exists because Prettier's dynamic `import()` calls need a Node flag (`--experimental-vm-modules` or similar) that Jest does not set. The type is the swap point.
- `editorconfig: true` is passed explicitly to `resolveConfig`; the Prettier **API** does not read `.editorconfig` by the way the CLI does, so omitting this flag silently drops editorconfig rules.
- `.prettierignore` is handled manually with `getFileInfo`. The Prettier API does not consult an ignore file on its own; without this check, a one-line edit in an excluded shared file would reflow the entire file.
