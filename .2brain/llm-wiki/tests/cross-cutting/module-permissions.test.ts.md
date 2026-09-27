---
source: tests/cross-cutting/module-permissions.test.ts
sha256: b4d07d9ff4b02b8a3c1a6e3eed06be6d4a1aaf127db0c0f2dc49b609f4b448a3
generated_at: 2026-09-27T15:51:10.441362+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/module-permissions.test.ts

## Purpose

Enforces bidirectional consistency between the shared permission-key registry (`PERMISSION_KEYS`) and each module's self-declared permissions. It fails if a key is attributed to a module that no longer exists (orphaned by a deletion) **or** if a module claims a key the shared file does not attribute to it (a phantom permission). Together these two directions guarantee that "deleting a module deletes its keys."

## Key elements

- **`claimed`** — `Map<string, string[]>`. Built from `enabledModules` (each module's `permissions` array) plus a manually added `'core'` entry sourced from `CORE_PERMISSION_KEYS`. Values are sorted.
- **`attributed`** — `Map<string, string[]>`. Built by iterating `PERMISSION_KEYS` and grouping each key's `key.key` under its `key.module`. Values are sorted.
- **`describe('the declared keys and the modules that own them')`** — four assertions:
  1. Every module in `attributed` exists in `claimed` (no orphaned module references).
  2. Per-module: `claimed.get(module)` deep-equals `attributed.get(module)` (exact key-set match, generated via `it.each`).
  3. The set of keyless modules is exactly `['access', 'addresses', 'antibot', 'wishlist']`.
  4. Flattening all `claimed` values yields the same sorted key list as `PERMISSION_KEYS` (no key is lost in either direction).

## Relationships

- **`src/modules.ts`** — provides `enabledModules`, the runtime list of active `AppModule` objects; the test reads each module's `name` and `permissions` to build the `claimed` map.
- **`src/kernel/permissions.ts`** — provides `PERMISSION_KEYS`, the shared registry of all permission keys with their `module` attribution; the test reads this to build the `attributed` map and for the set-equality check.
- **`src/kernel/translation.ts`** — provides `CORE_PERMISSION_KEYS`, the kernel-level keys (e.g. `translations.any.*`) that guard ports rather than a specific module; the test folds them into `claimed` under the pseudo-module name `'core'`.

## Notes

- `'core'` is **not** an `AppModule` and never appears in `enabledModules`; it is added to `claimed` manually. If new core keys are added to `CORE_PERMISSION_KEYS`, this test will catch the drift automatically.
- The keyless-module test (assertion 3) hardcodes the expected list `['access', 'addresses', 'antibot', 'wishlist']`. Adding a key to any of those modules—or removing a key from one of them so it gains a key—will fail this assertion, signalling a model change rather than a simple typo.
- The test does **not** check ordering of keys within a module (both sides are `.toSorted()` before comparison); it checks set equality.
- Conventions from the module docblock: this test plays the same structural role for permissions that `check:docs-graph` does for docs and `depcruise` does for imports—it is the "no dangling references" guard for the permission-key ↔ module mapping.
