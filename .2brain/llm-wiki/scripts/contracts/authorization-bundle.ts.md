---
source: scripts/contracts/authorization-bundle.ts
source_sha256: dc2fd3c081ae81c767d96e8cf58c07a82c17cee42b689962c52417338a1f7a1f
context_sha256: 9efadf0ef00bc6f26dd65dad14b67476939817ec186766123b31f3540c99a358
generated_at: 2026-11-22T01:53:54.751404+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/authorization-bundle.ts

## Purpose
Generates `shared/authorization-keys.generated.yaml` by splicing one `authorization.yaml` fragment per module, plus a `core` fragment and a root residual file, into a single committed bundle. Run via `npm run regenerate`. Because fragments live in their modules, a deleted module's rules disappear with it. The bundle is shared with a PHP twin that also reads it.

## Key elements
- `ROOT_FILE` (`shared/contracts/authorization-keys.root.yaml`): preamble, `version`, `actions`, `implies`, `scopes`, closing note. Contains the `# %AUTHORIZATION_RULES%` and `# %AUTHORIZATION_SETS%` marker comments where the sections are spliced in.
- `CORE_FILE` (`shared/contracts/authorization-keys.core.yaml`): app-level rules and sets (e.g. `read:Translation`, `update:Translation`) that belong to `core` rather than a module.
- `OUTPUT_FILE`: `shared/authorization-keys.generated.yaml`, the committed bundle that backends read at boot.
- `PREFERRED_ORDER`: the section order of the original hand-written file, kept to keep PHP-side diffs small. `core` sits between `locales` and `users`.
- `fragmentPath(section)`: resolves `core` to `CORE_FILE` and any other section to `src/modules/<section>/authorization.yaml`.
- `fragmentBlocks(section)`: reads the fragment's raw text and returns its `rules` and `sets` blocks with headings and trailing newlines stripped. It throws if the file is missing, or if any rule or set declares a `module` other than the section it lives in.
- `sectionsOnDisk()`: modules that have an `authorization.yaml`, plus `core`.
- `assembleAuthorizationKeys()` (exported): builds the final text. It checks that both markers are present in the root file, orders sections by `PREFERRED_ORDER` with extras appended, joins the rules and non-empty sets blocks with blank lines, and splices them in at the markers.
- The last statement runs `writeOrCheck(...)` at import time, so it writes the file, or under `--check` compares it.

## Relationships
- `./section-order`: `orderSections` applies `PREFERRED_ORDER` to the sections found on disk.
- `./fragments`: `readAuthorizationFragment` parses a fragment so `fragmentBlocks` can check each entry's `module`.
- `./generated-file`: `writeOrCheck` writes the output or, in `--check` mode, fails if the committed file is stale.
- `../modules-on-disk`: provides `REPO_ROOT`, `MODULES_ROOT` and `modulesWith` for path building and module discovery.
- `./asyncapi-bundles`: a contrast point only. That file merges channel maps through the YAML AST, while this one splices text. There is no code dependency.

## Notes
- Splicing is textual on purpose. Entries are flat, self-contained list items, so this keeps every authored byte and avoids the YAML stringifier re-wrapping descriptions or re-quoting scalars.
- The markers are YAML comments, so the root file still parses as one document with no `rules` or `sets` field of its own.
- The bundle is deliberately not in `bundle-registry.ts`. There, `shared` means the paired frontend holds a copy, whereas this file is shared with a PHP repository this repo cannot access or test against.
- The module-attribution check fails closed. A fragment whose entries name another module is rejected, not silently accepted.
- Importing the module has side effects, because it writes or checks the output file immediately.
