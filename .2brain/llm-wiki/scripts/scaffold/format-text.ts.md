---
source: scripts/scaffold/format-text.ts
source_sha256: bb373360ebb6fab8a32c93ecaa898ec63d23525020bda4b879a370da3a3bf539
context_sha256: 950aa41b76c211240b906e90e4099b17603890b6edb27fb0a3546c33199d809e
generated_at: 2026-11-22T02:15:37.409392+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/format-text.ts

## Purpose
Provides text formatting for scaffolded output behind a small seam. The real implementation wraps Prettier and applies the repo's configuration. Unit tests can substitute an identity formatter, because Prettier can't load under Jest (its dynamic imports need a Node flag Jest doesn't set).

## Key elements
- `FormatText` (type): `(root, file, content) => Promise<string>`. It turns raw text into what `prettier:check` accepts for `file`.
- `formatWithRepoConfig` (const): the real `FormatText` implementation.
  - It calls Prettier's `getFileInfo` with `<root>/.prettierignore`. If the file is ignored, it returns the content unchanged.
  - Otherwise it calls `format` with the config from `resolveConfig(file, { editorconfig: true })` and `filepath: file`, so the file path selects the parser.

## Relationships
The neighbor files are not shown in this file's content. The only relationship it declares is the seam itself: callers take a `FormatText` and can be given either `formatWithRepoConfig` or an identity function. The neighbors listed in the graph are the likely consumers:
- `scripts/scaffold/apply.ts`, `demo-remove.ts`, `scaffold-module.ts` and `scenario-registry.ts`
- `scripts/contracts/generate-shared-rule-schemas.ts` and `scripts/docs/generate-scenario-registries.ts`
- `tests/unit/scripts/scaffold/apply.test.ts`, which is presumably where the identity formatter is passed

## Notes
- `editorconfig: true` is set explicitly because the Prettier API, unlike the CLI, doesn't read `.editorconfig` on its own.
- Files matched by `.prettierignore` are returned untouched. This stops a hand-formatted shared file from being reflowed in full around a one-line edit.
- `file` must be an absolute path. `root` is used only to locate `.prettierignore`.
