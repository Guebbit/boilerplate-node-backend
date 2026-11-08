---
source: tests/cross-cutting/locale-namespaces.test.ts
sha256: c7a66306f3deec5dc2b5f9dd4eabffb24638e835d3554f030e1f10e43fdbab96
generated_at: 2026-11-08T09:27:31.293296+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-namespaces.test.ts

## Purpose

Guards against two silent locale-merge failures that the deep, last-writer-wins merge at boot would otherwise hide: a module redefining a shared cross-repo contract key, and two modules colliding on the same key. Also enforces a naming convention (each key lives under its owning module's prefix) so key ownership is derivable from the key string alone.

## Key elements

- **`flatten(value, prefix?)`** — Recursively walks a nested object and returns every dotted leaf key (e.g. `account.email.reset-request.subject`).
- **`readDictionary(file)`** — Reads and parses a JSON locale file into a plain object.
- **`moduleKeys()`** — Scans `MODULES_ROOT` for `<name>/locales/en.json` and returns a `Map<moduleName, string[]>` of that module's flattened keys.
- **`CO_OWNED_NAMESPACES`** — Whitelist of prefixes (`tasks.task-kind.`, `tasks.task-category.`) that are co-owned by `notifications` and `shop-tasks`, exempted from the single-owner namespace rule.
- **`describe('locale namespaces across modules')`** — Four tests: (1) a canary asserting the sweep actually found ≥ 1 module with copy; (2) no module key overlaps the shared `shared/locales/en.json` key set; (3) no two modules claim the same key; (4) every key starts with its module name's prefix unless it falls under a co-owned namespace.

## Relationships

- **`tests/support/paths.ts`** — Supplies `MODULES_ROOT` and `REPO_ROOT` constants used to locate the `src/modules/` directory and the `shared/locales/` directory on disk.

## Notes

- The language-parity check (every locale file declares the same keys) lives in a sibling file, `tests/cross-cutting/locale-parity.test.ts`; this file only inspects `en.json` and key *ownership*, not cross-locale completeness.
- The co-owned namespace exception exists because task-kind/category *names* are written by `notifications` (staff mail) while the *values* come from `shop-tasks`. The test still requires each individual key to be claimed by exactly one module.
- The "finds dictionaries" canary test deliberately asserts against the directory listing (disk truth) rather than a hardcoded module count, so adding a new domain does not break this locale test.
