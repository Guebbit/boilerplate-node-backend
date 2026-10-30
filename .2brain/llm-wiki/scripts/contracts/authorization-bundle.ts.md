---
source: scripts/contracts/authorization-bundle.ts
sha256: 6f4ae21d97c7f197f805d506ead6ee0c06e13e6df838c642f40f93c8836754b8
generated_at: 2026-10-29T01:29:36.460358+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/authorization-bundle.ts

## Purpose

Assembles `shared/authorization-keys.yaml` by splicing per-module `authorization.yaml` fragments (discovered on disk) into a root residual file. It uses raw text concatenation rather than a YAML-AST merge so that every authored byte is preserved — critical because the output is consumed by a PHP twin that would break if a stringifier re-quoted a scalar. The script is both a generator (`npm run regenerate`) and a staleness checker (`--check`).

## Key elements

- **`assembleAuthorizationKeys()`** *(exported)* — Reads the root file, splits it at the `# %AUTHORIZATION_RULES%` and `# %AUTHORIZATION_SETS%` markers, then joins each section's rules and sets blocks in `PREFERRED_ORDER` to produce the final YAML string.
- **`fragmentBlocks(section)`** — Reads one fragment, validates that every rule/set declares the correct `module:` field (fail-closed typo guard), and returns the `rules:` and `sets:` bodies with their headings stripped.
- **`sectionsOnDisk()`** — Returns the list of sections that actually have a fragment file (modules with `authorization.yaml` plus `core`). A deleted module simply disappears from the output.
- **`PREFERRED_ORDER`** — Hard-coded section ordering that mirrors the original hand-written file, kept so a PHP port's diff stays minimal.
- **`fragmentPath(section)`** — Resolves the fragment file path; `core` maps to `shared/contracts/authorization-keys.core.yaml`, everything else to `src/modules/<section>/authorization.yaml`.
- **`RULES_MARKER` / `SETS_MARKER`** — YAML comment lines in the root file that act as splice points.
- **`writeOrCheck(OUTPUT_FILE, …)`** — Final call: writes the bundle or, under `--check`, diffs against the committed file.

## Relationships

- **`scripts/contracts/section-order.ts`** — Provides `orderSections`, which sorts the on-disk sections by `PREFERRED_ORDER` (known entries first, unknowns appended).
- **`scripts/contracts/fragments.ts`** — Provides `readAuthorizationFragment`, used here to parse a fragment's rules/sets for the module-attribution validation.
- **`scripts/contracts/generated-file.ts`** — Provides `writeOrCheck`, the shared write-or-verify primitive for all generated bundles.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for filesystem discovery of which modules carry a fragment.
- **`scripts/contracts/asyncapi-bundles.ts`** — Conceptual contrast only (no import): that file merges channel maps through the YAML AST; this file deliberately avoids that path in favor of text splicing.

## Notes

- **`core` is not a module directory.** Its fragment lives under `shared/contracts/`, not `src/modules/`. Code that generically iterates modules must special-case `core` (see `fragmentPath` and the `sectionsOnDisk` append).
- **Validation is fail-closed, not advisory.** If any rule or set declares a `module:` value different from the section that owns the fragment, `fragmentBlocks` throws — the bundle refuses to emit a file with misattributed entries.
- **Separate from `bundle-registry.ts`.** The header comment explains this bundle is intentionally *not* registered there: the registry's "shared" contract means "a paired frontend holds a copy," whereas this file is shared with an external PHP repository for which no pairing test exists.
- **The root file's markers are YAML comments**, so the file remains a single valid YAML document even before splicing; the `rules:` and `sets:` keys are injected by the splice itself.
