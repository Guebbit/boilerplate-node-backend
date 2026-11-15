---
source: scripts/contracts/authorization-bundle.ts
sha256: 37e8ec4b40ca5dcef9c3e97589e7c49301b99ed483b4bf2e0bb4b58725995445
generated_at: 2026-11-14T17:22:49.583174+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/authorization-bundle.ts

## Purpose

Assembles the committed `shared/authorization-keys.generated.yaml` by splicing together per-module authorization fragments and a root residual file. Each rule/set lives in its own module's `authorization.yaml`, so deleting a module drops its rules automatically. The assembled file is also consumed by a PHP backend, which is why the splice is done as raw text rather than a YAML AST merge.

## Key elements

- **`assembleAuthorizationKeys()`** (exported) — reads the root file, splits it at the `# %AUTHORIZATION_RULES%` / `# %AUTHORIZATION_SETS%` markers, discovers all on-disk fragments, orders them via `PREFERRED_ORDER`, and returns the fully spliced YAML text.
- **`fragmentBlocks(section)`** — reads one fragment, validates that every rule/set entry declares `module: <section>` (fail-closed on mismatch), and returns the raw `rules` and `sets` text blocks with headings stripped.
- **`sectionsOnDisk()`** — returns module folders that contain an `authorization.yaml`, plus the special `core` section.
- **`fragmentPath(section)`** — resolves the fragment file: `shared/contracts/authorization-keys.core.yaml` for `core`, otherwise `src/modules/<section>/authorization.yaml`.
- **`PREFERRED_ORDER`** — fixed array of 17 section names that preserves the original hand-written file's ordering (keeps the PHP twin's diff small).
- **Module-level side effect** — the last line calls `writeOrCheck(OUTPUT_FILE, assembleAuthorizationKeys(), …)`, so simply importing/running the script writes or checks the output file.

## Relationships

- **`scripts/contracts/fragments.ts`** — imports `readAuthorizationFragment` to parse a fragment for the misattribution check before the raw-text split.
- **`scripts/contracts/section-order.ts`** — imports `orderSections` to sort discovered sections into `PREFERRED_ORDER` (extras appended).
- **`scripts/contracts/generated-file.ts`** — imports `writeOrCheck` to write the output or, under `--check`, verify it is not stale.
- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith` for path construction and fragment discovery.
- **`scripts/contracts/asyncapi-bundles.ts`** — no import; referenced in the header comment as the contrast case (AST merge) that this file deliberately avoids.

## Notes

- The splice is intentionally text-based, not a YAML merge: every authored byte (quoting, description wrapping) must survive intact because the PHP twin reads the file directly.
- `core` is not a real module folder; it maps to `shared/contracts/authorization-keys.core.yaml` and holds app-level rules (e.g. `read:Translation`) that don't belong to a single module.
- The `--check` contract here is deliberately kept out of `bundle-registry.ts` because "shared" in that registry means the frontend holds a copy — a different sharing story than the PHP-twin relationship this file has.
- The root file is expected to contain two sentinel markers (`# %AUTHORIZATION_RULES%`, `# %AUTHORIZATION_SETS%`); their absence is a hard error.
