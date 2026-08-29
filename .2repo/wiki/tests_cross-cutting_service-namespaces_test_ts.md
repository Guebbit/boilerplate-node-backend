# tests/cross-cutting/service-namespaces.test.ts

## Purpose

Enforces a structural convention across all modules in `src/modules/`: each service must expose exactly one namespace object (suffixed `*Service`) that contains every function the service exports. It exists to catch the silent failure mode where a newly added function is left as a loose export outside the namespace, which would break `jest.spyOn`-based specs and fragment the service's public surface.

## Key elements

- **`listServiceEntries()`** — Walks `src/modules/` on disk and returns every module that has a `service.ts` or `services/index.ts` file. No hardcoded module list; new modules are picked up automatically.
- **`isNamespace(value)`** — Type guard: true when `value` is a non-null, non-array object with at least one member and every member is a function. Used to identify the `*Service` export among a module's other exports.
- **`isFunction(value)`** — Simple `typeof === 'function'` type guard.
- **Test 1 (canary)** — Asserts the discovered set of entries matches the set of modules on disk that have a service file, and that the set is non-empty. Prevents the sweep from silently matching nothing.
- **Test 2 (`it.each`)** — For each service file, asserts exactly one export is a namespace and its name matches `/Service$/`.
- **Test 3 (`it.each`)** — For each service file, collects all function-valued exports and asserts every one is a member of the namespace object (i.e., no loose function exports are left outside it).

## Relationships

No graph neighbors are registered for this file. It reads only from the filesystem (`node:fs`, `node:path`) and dynamically imports service modules at test time; it is not imported by any other module.

## Notes

- The test deliberately does **not** require the namespace to be named after its folder. `feedback` exports `feedbackRequestService` and `audit-logs` exports `auditLogService`; both are valid.
- Discovery is from disk, so adding a new module requires zero edits to this test.
- The canary test compares against a live `readdirSync` rather than a hardcoded integer, avoiding a duplicated module count.
- Both single-file (`service.ts`) and split-directory (`services/index.ts`) service layouts are covered; the split form is expected once a service exceeds ~300 lines (see `docs/theory/layers.md`).
