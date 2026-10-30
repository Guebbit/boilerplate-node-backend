---
source: tests/cross-cutting/locale-namespaces.test.ts
sha256: 5fa1217857c8d1b8ec2ce5bf0353efd9a8d4a8cfb51e799722d2ca71de6a22a9
generated_at: 2026-10-29T06:46:38.656390+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-namespaces.test.ts

## Purpose

Guards the locale-merge contract: because `infrastructure` deep-merges every module's `locales/` directory onto a shared dictionary at boot, a module can silently shadow a shared key or collide with another module without producing a build error. This file asserts four invariants—discovery, no shadowing of shared keys, no inter-module collisions, and namespace ownership—so that wrong copy (not a crash) is caught at test time.

## Key elements

- **`flatten(value, prefix)`** — Recursively walks a nested object and returns every dotted leaf key (e.g. `account.email.reset-request.subject`).
- **`readDictionary(file)`** — Reads a JSON locale file from disk and parses it into a plain object.
- **`moduleKeys()`** — Scans `MODULES_ROOT` for subdirectories containing `locales/en.json` and returns a `Map<module-name, string[]>` of that module's flattened keys. Discovery-based, not a hardcoded list.
- **`describe('locale namespaces across modules')`** — Four tests:
  1. *finds dictionaries in every module that ships copy* — canary that the sweep actually found ≥ 1 module on disk.
  2. *never lets a module shadow a shared key* — no module key may overlap the shared `shared/locales/en.json` key set.
  3. *never lets two modules claim the same key* — each key appears in at most one module.
  4. *keeps every module inside a namespace it owns* — every key must be prefixed with `<module-name>.`, so ownership is derivable from the key alone.

## Relationships

- **`tests/support/paths.ts`** — Provides `MODULES_ROOT` and `REPO_ROOT` (imported as `@tests/paths`). `MODULES_ROOT` is the directory scanned for module subdirectories; `REPO_ROOT` anchors the path to `shared/locales/en.json`.

## Notes

- The canary test (test 1) asserts against `readdirSync(MODULES_ROOT).length > 0` rather than pinning a module count, so adding a new domain module does not break a locale test.
- Language parity (every locale declaring the same keys) is **not** tested here; that lives in `tests/cross-cutting/locale-parity.test.ts`, which runs against the merged dictionaries.
- The "no shadowing" test encodes a **cross-repo contract**: a paired frontend reads shared keys (e.g. `generic.error-internal-server-error`) by name from `GET /locales/:locale`. A module redefining one of those keys would change copy in a different repository with no local error.
