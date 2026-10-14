---
source: scripts/contracts/authorization-bundle.ts
sha256: 2e2cfa258c70c74aa4113eef0fe4b365083f2f3fc145a3464a85fa197e00e886
generated_at: 2026-10-14T07:09:32.851701+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/authorization-bundle.ts

## Purpose

Assembles `shared/authorization-keys.yaml` (the committed bundle read at boot by the backend and the PHP twin) from per-module `authorization.yaml` fragments plus a root residual file. Runs as `npm run authorization:bundle` or with `--check` to assert the committed file is not stale. Uses a plain text splice rather than a YAML-AST merge to preserve authored bytes verbatim.

## Key elements

- **`assembleAuthorizationKeys()`** (exported) — reads the root file, locates the splice marker, collects each on-disk section's keys block in `PREFERRED_ORDER`, and returns the fully assembled bundle string.
- **`fragmentKeysBlock(section)`** — reads one fragment, parses it minimally to validate that every key's `module` field matches its owning folder (fail-closed on mismatch), then returns the raw YAML text with the `keys:` heading stripped.
- **`sectionsOnDisk()`** — lists module directories under `src/modules/` that contain an `authorization.yaml`, plus the special `core` section.
- **`fragmentPath(section)`** — resolves the fragment file path; `core` maps to `shared/contracts/authorization-keys.core.yaml`, all others to `src/modules/<section>/authorization.yaml`.
- **`PREFERRED_ORDER`** — a fixed array controlling section order in the output so the PHP port's diff stays minimal.
- **`SPLICE_MARKER`** (`# %AUTHORIZATION_KEYS%`) — the comment in the root file where the keys list is injected.
- **`--check` flag** — when present, compares assembled vs. committed text and exits 1 on drift without writing.
- **`FragmentKey` / `FragmentDocument`** — minimal shapes used only to validate the `module` field on each key entry.

## Relationships

- **`scripts/contracts/section-order.ts`** — provides `orderSections`, which orders the discovered sections according to `PREFERRED_ORDER`, appending any unlisted sections at the end.

## Notes

- The bundle is **text-spliced**, not merged through the YAML AST (unlike `asyncapi-bundles.ts`). This preserves authoring (quoting, description wrapping) because the file is also consumed by a separate PHP repository with no pairing test.
- `core` is not a module directory; it is a special app-level fragment (`authorization-keys.core.yaml`) holding `translations.any.*` keys. It is always present in the section list.
- Deletion is implicit: a module folder removed from the tree simply stops contributing a fragment—no manual list to update.
- The `--check` contract is intentionally kept **outside** `bundle-registry.ts` because that registry's "shared" means "the paired frontend holds a copy," whereas this file's consumer is the PHP twin (a repo with no pairing test).
- A fragment whose keys declare a `module` value different from its own folder name causes a hard error (the bundle refuses to "launder" a typo).
