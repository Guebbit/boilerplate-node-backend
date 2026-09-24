---
source: tests/cross-cutting/module-permissions.test.ts
sha256: d85a487ec206b3161a3d616b76421db30294200692ebe853f2978b6a447b1b9c
generated_at: 2026-09-23T19:57:13.005462+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-permissions.test.ts

## Purpose

Cross-cutting consistency test that enforces bidirectional agreement between the shared permission-key registry and each module's manifest. It guarantees that no key points at a nonexistent module, no module claims keys the registry doesn't attribute to it, and the union of all claims equals the full key set—so that deleting a module also deletes its keys (and vice versa).

## Key elements

- **`claimed`** — `Map<string, string[]>` built from `enabledModules`; maps each enabled module's name to its sorted `permissions` array (or `[]` if the field is absent).
- **`attributed`** — `Map<string, string[]>` built by iterating `PERMISSION_KEYS`; groups keys by their `module` field, sorted.
- **`describe('the declared keys and the modules that own them')`** — four assertions:
    - _Orphan check_: every module name appearing in `attributed` must also exist in `claimed` (no dangling references to deleted modules).
    - _Per-module equality_ (`it.each`): for every module in `attributed`, its claimed keys must exactly equal its attributed keys.
    - _Keyless-modules whitelist_: the set of modules with zero claimed keys must be exactly `['access', 'addresses', 'antibot', 'wishlist']`—guards the "signed-in ≠ role-gated" boundary.
    - _Set equality_: the flat list of all claimed keys must equal `PERMISSION_KEYS` (no key exists in one place but not the other).

## Relationships

- **`src/modules.ts`** — supplies `enabledModules`, the runtime list of active modules. The test derives its `claimed` map entirely from this; adding or removing a module changes which entries are expected.
- **`src/kernel/permissions.ts`** — supplies `PERMISSION_KEYS`, the canonical list of `{ key, module }` records. The test derives its `attributed` map and the set-equality baseline from this.

## Notes

- The test is intentionally bidirectional: each direction catches a different class of silent rot (orphaned keys vs. phantom claims). Neither direction is redundant.
- The keyless-modules test hard-codes four module names. If a new module is added that legitimately has no route-level permissions, this test must be updated—its failure is the signal that a model-level decision was made.
- All comparisons use `.toSorted()` before `toEqual`, so array order in source data is irrelevant; only set membership matters.
- The `access` module is listed among keyless modules even though it has no routes at all (unlike `addresses`/`cart`/`wishlist`/`antibot` which have routes but no role gates). This is a deliberate distinction documented in the inline comment.
