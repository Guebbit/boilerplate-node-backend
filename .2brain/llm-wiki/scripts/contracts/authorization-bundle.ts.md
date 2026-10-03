---
source: scripts/contracts/authorization-bundle.ts
sha256: fecdc673883908cb466575feb390c89fd51004ecfd4f7c4e3f2763ed42737188
generated_at: 2026-10-01T12:25:19.130216+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/authorization-bundle.ts

## Purpose

Assembles the committed `shared/authorization-keys.yaml` by text-splicing a root residual file with one fragment per module (`src/modules/<name>/authorization.yaml`) plus the app-level `core` fragment. Replaces the earlier pattern where permission-key definitions lived centrally *and* were hand-listed in each module's manifest; the fragment itself is now the single source of truth, and the bundle guarantees a module's keys vanish when its folder does. Runs via `npm run authorization:bundle`; supports `--check` for CI staleness detection.

## Key elements

- **`SPLICE_MARKER`** (`# %AUTHORIZATION_KEYS%`) — a YAML comment in the root file marking where all fragments are inserted.
- **`PREFERRED_ORDER`** — the canonical section order (products → … → observability). A preference, not a registry; see `section-order.ts`.
- **`fragmentPath(section)`** — resolves the on-disk path for a section's fragment. Special-cases `core` (lives in `shared/contracts/` rather than `src/modules/`).
- **`fragmentKeysBlock(section)`** — reads a fragment, validates that every key's `module:` field matches the owning folder (fail-closed on misattribution), strips the `keys:` heading, and returns the raw list text.
- **`sectionsOnDisk()`** — discovers which module directories actually contain an `authorization.yaml`, always including `core`.
- **`assembleAuthorizationKeys()`** (exported) — reads the root file, splits at the marker, orders sections via `orderSections`, maps each to its fragment block, and reassembles the full YAML text.
- **Main block** — compares assembled output to the committed file; writes it (or exits 1 under `--check` with a remediation hint).

## Relationships

- **`scripts/contracts/section-order.ts`** — imports `orderSections`, which reorders the discovered sections to match `PREFERRED_ORDER` while appending any unlisted sections. This is the file's only import outside `node:` builtins and `yaml`.

## Notes

- **Text splice, not YAML merge.** Every key is a flat, self-contained list item; a structural merge would risk the stringifier re-quoting scalars or re-wrapping descriptions. Byte-fidelity matters because the PHP twin repo reads this file directly.
- **Kept out of `bundle-registry.ts`.** That registry's "shared" means "the paired frontend holds a copy." Here the sharing partner is the PHP twin, a separate repository with no pairing test.
- **`core` is special-cased.** Its fragment lives in `shared/contracts/authorization-keys.core.yaml`, not under `src/modules/`. Its keys sit between `locales` and `users` in the output to minimize the PHP twin's diff.
- **Fail-closed attribution check** in `fragmentKeysBlock` supersedes the old `tests/cross-cutting/module-permissions.test.ts` reconciliation: a key that names the wrong `module:` is a hard error, not a test failure.
