---
source: tests/cross-cutting/authorization-keys.test.ts
sha256: dbd52f5fa67d6b3b18c75acea76202c7a072f8b4637105b57c90b95b52e1aeb3
generated_at: 2026-09-23T19:54:07.218219+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-keys.test.ts

## Purpose

Validates the internal consistency of the permission-key registry and preset roles exported by `src/kernel/permissions.ts`. It ensures the data is well-formed (unique, correctly scoped, properly named) and that no preset role references a key no module declares. It complements the neighboring conformance suite (which proves two backends agree) by proving the shared data they both read is not nonsense in the first place.

## Key elements

- **"the declared keys" block** — Asserts each `PERMISSION_KEYS` entry has a unique key, a key that ends with `.${action}`, a scope consistent with `scopeOfKey(key.key)`, and a lowercase-dotted format (because keys are stored verbatim and renaming is a migration).
- **"the preset roles" block** — Iterates over `PRESET_ROLES` + `ANONYMOUS_ROLE` and asserts every held key passes `assertDeclared` (is actually declared) and belongs to the role's own scope. Pins that exactly one unrestricted TENANT role exists (`admin`), and documents that `operator` is currently unrestricted in platform scope solely because platform declares exactly one key.
- **"assertDeclared" block** — Confirms the runtime guard throws `/not declared/` for both a genuinely unknown key and a plausible near-miss (e.g. `product.read` vs. `products.read`).

## Relationships

- **`src/kernel/permissions.ts`** — Sole dependency. The test imports `PERMISSION_KEYS`, `PRESET_ROLES`, `ANONYMOUS_ROLE`, `scopeOfKey`, `isUnrestrictedRole`, `assertDeclared`, and the `RoleLookup` type. Every assertion in this file is a check on the values or behavior of that module's exports.

## Notes

- The `operator`/platform-scope test (`toHaveLength(1)`) is a deliberate canary: adding a second platform-scoped key will break this test and force a conscious re-decision about whether `operator` should still be considered unrestricted. It is not a general "unrestricted = super-admin" claim.
- Key format is treated as a stored, migration-sensitive value (lowercase, dotted, `[a-z][.a-z]*[a-z]`); do not relax the regex without considering existing persisted data.
- `assertDeclared` is the _write-time_ guard (called when a grant is made); the preset-role loop here is the _read-time_ check that the static data is self-consistent. Both halves of the invariant are covered.
