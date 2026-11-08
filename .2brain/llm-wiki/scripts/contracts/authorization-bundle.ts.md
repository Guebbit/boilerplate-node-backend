---
source: scripts/contracts/authorization-bundle.ts
sha256: 36402e670c177ff5606d766b1dd0b29ab6cded5cfb5723fffacf8efe4fe9faf2
generated_at: 2026-11-08T02:39:14.770598+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/authorization-bundle.ts

## Purpose

Assembles `shared/authorization-keys.yaml` by text-splicing per-module `authorization.yaml` fragments and a root residual file. Exists so that each module's authorization rules live in its own folder and are dropped automatically when the module is deleted, and so the committed bundle can be verified against its fragments via `npm run regenerate` (or `--check`).

## Key elements

- **`assembleAuthorizationKeys()`** (exported) — Reads the root file, locates the `# %AUTHORIZATION_RULES%` and `# %AUTHORIZATION_SETS%` markers, collects each on-disk fragment's rules and sets blocks in `PREFERRED_ORDER`, and returns the full bundle as a string.
- **`fragmentBlocks(section)`** — Reads one fragment, validates that every rule/set declares the correct `module`, strips the `rules:` / `sets:` headings, and returns the raw text blocks. Throws on missing file, malformed YAML, or misattributed entries.
- **`sectionsOnDisk()`** — Returns the list of sections that have a fragment: every module folder containing `authorization.yaml` (via `modulesWith`) plus `core`.
- **`fragmentPath(section)`** — Resolves the on-disk path; `core` maps to `shared/contracts/authorization-keys.core.yaml`, everything else to `src/modules/<section>/authorization.yaml`.
- **`PREFERRED_ORDER`** — Static array pinning section order so the PHP twin's diff stays small; any section not listed is appended.
- **`RULES_MARKER` / `SETS_HEADS`** — YAML comment tokens in the root file that mark where spliced content is inserted.
- **`writeOrCheck(…)`** — Bottom-level call that writes the output or, under `--check`, diffs it against the committed file.

## Relationships

- **`scripts/contracts/section-order.ts`** — Provides `orderSections`, used to sort fragments into `PREFERRED_ORDER` with extras appended.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` to discover which module folders carry an `authorization.yaml`.
- **`scripts/contracts/fragments.ts`** — Provides `readAuthorizationFragment`, used for structural validation (module attribution check) before the text splice.
- **`scripts/contracts/generated-file.ts`** — Provides `writeOrCheck`, the shared write-or-check primitive for all contract bundles.
- **`scripts/contracts/asyncapi-bundles.ts`** — Not imported here, but referenced as the contrast: that bundle merges via the YAML AST, whereas this one deliberately splices raw text.

## Notes

- **Text splice, not AST merge.** Every entry is a flat, self-contained list item; merging through a YAML parser risks the stringifier re-wrapping descriptions or re-quoting scalars. Preserving authored bytes matters because the PHP twin reads the same file.
- **`core` is special-cased.** It is not a module folder; its fragment lives at `shared/contracts/authorization-keys.core.yaml` and holds app-level rules (e.g. `read:Translation`) that belong to no single module.
- **Fail-closed attribution check.** A rule or set whose `module` field doesn't match the folder it sits in causes the script to throw rather than silently emit the bundle.
- **`--check` is separate from `bundle-registry.ts`.** In the registry, "shared" means the paired frontend holds a copy; here "shared" means the PHP twin (a separate repository with no pairing test) reads the file. Keeping the check inline avoids conflating the two contracts.
- **Deletion-safe.** The bundle reads only fragments that exist on disk; deleting a module folder removes its rules with no list to update.
