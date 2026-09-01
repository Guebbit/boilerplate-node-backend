# tests/unit/kernel/registry.test.ts

## Purpose

Unit tests for `registerModules`, the sole boot-time function the registry exposes. The file asserts exactly two observable contracts: every module that declares a `subscribe` callback has it invoked, and a module that declares none is a valid, non-error path.

## Key elements

- **Test 1 — "calls subscribe on every module that declares one"**: Passes two `AppModule` objects (both with a `subscribe` jest.fn) to `registerModules`; asserts each spy was called exactly once.
- **Test 2 — "skips a module with no subscribe…"**: Passes a mixed array (one module with no `subscribe`, one with). Asserts the call does not throw and the single present `subscribe` was still invoked.
- **Imports**: `registerModules` and the `AppModule` type from `@kernel/registry`.

## Relationships

- **`src/kernel/registry.ts`** — sole dependency; provides both the function under test and the `AppModule` type used to construct test fixtures.

## Notes

- The file-level doc comment records that earlier tests for duplicate-name detection, unknown-dependency resolution, and cycle checking were **removed** together with the `dependsOn` field they validated, because nothing read that field at runtime. The rationale lives in `OVERENGINEERED.md` §1.
- `subscribe` is **optional** on `AppModule`. Test 2 exists specifically to pin that contract: the registry must treat its absence as ordinary, not as a misconfiguration.
- There is no `describe` block; both assertions sit at the top level of the file.
