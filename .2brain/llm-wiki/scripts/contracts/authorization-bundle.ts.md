---
source: scripts/contracts/authorization-bundle.ts
sha256: 9e619648a9200df079b2a4af17ce5304737d7c38290d7c58f44d1e74c5baef15
generated_at: 2026-10-15T09:35:49.598402+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/authorization-bundle.ts

## Purpose

Assembles `shared/authorization-keys.yaml` by text-splicing one fragment per module plus a root residual file. Keys live in their owning module's `authorization.yaml`, so deleting a module automatically removes its keys from the bundle — no hand-maintained registry to reconcile.

## Key elements

- **`assembleAuthorizationKeys()`** (exported) — Reads the root file, locates the splice marker, gathers every on-disk fragment in `PREFERRED_ORDER`, and returns the full YAML text.
- **`fragmentKeysBlock(section)`** — Reads one fragment, validates that every key's `module:` field matches the owning section (fail-closed), strips the `keys:` heading, returns the raw list text.
- **`sectionsOnDisk()`** — Discovers which sections contribute a fragment: every module folder containing `authorization.yaml`, plus `core`.
- **`PREFERRED_ORDER`** — Section ordering that keeps the PHP twin's diff small; extras beyond this list are appended at the end.
- **`SPLICE_MARKER`** (`# %AUTHORIZATION_KEYS%`) — A YAML comment in the root file marking where the `keys:` block is inserted.
- **Top-level `writeOrCheck(...)` call** — Writes the output or, under `--check`, asserts the committed file is not stale.

## Relationships

- **`scripts/contracts/fragments.ts`** — Provides `readAuthorizationFragment`, used to parse a fragment and extract its `keys` array for the module-attribution check.
- **`scripts/contracts/generated-file.ts`** — Provides `writeOrCheck`, the shared write-or-`--check` mechanism for generated artifacts.
- **`scripts/contracts/section-order.ts`** — Provides `orderSections`, which arranges the on-disk sections according to `PREFERRED_ORDER`.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT`, `MODULES_ROOT`, and `modulesWith`, used to discover which module folders exist and which carry an `authorization.yaml`.

## Notes

- **Text splice, not YAML merge.** Fragments are concatenated as raw text rather than merged through a YAML AST. This preserves every authored byte (quoting, descriptions) and matters because the PHP twin in a separate repo parses this file directly.
- **`--check` is intentionally outside `bundle-registry.ts`.** In that registry "shared" means a paired frontend holds a copy; here the consumer is the PHP repo, which has no pairing test and is not in this repository.
- **`core` is a special section.** Its fragment lives at `shared/contracts/authorization-keys.core.yaml`, not under a module folder. It is always included in `sectionsOnDisk()`.
- **Fail-closed attribution.** If a key in a fragment declares a `module:` different from the folder it lives in, the bundle throws rather than silently accepting the misattribution.
