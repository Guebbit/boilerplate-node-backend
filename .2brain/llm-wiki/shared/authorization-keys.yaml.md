---
source: shared/authorization-keys.yaml
sha256: df5fbd87bf2e669bf29bcab80d8a4c59f8494167b45f5232c130868c1a6565d3
generated_at: 2026-10-14T07:34:42.219850+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-keys.yaml

## Purpose

The generated, canonical registry of every authorization permission key, the action vocabulary, the scope definitions, and per-key metadata (conditions, step-up tier, `shopperOnly` flag) for the platform. It is produced by `npm run authorization:bundle` by splicing one fragment per owning module (`src/modules/<name>/authorization.yaml`) together with the root-level `core` keys. No key may be introduced here directly; the `--check` flag (wired into the `complete` script) fails the build if this bundle drifts from the fragments.

## Key elements

- **`actions`** — The complete, closed vocabulary of verbs a key may use. Contains CASL's `read`, `create`, `update`, `delete` plus seven domain-specific additions (`checkout`, `sweep`, `override`, `start`, `receive`, `ban`, `export`). `write` and `manage` are deliberately absent. This list is the single source from which `npm run gen:api` emits `api/permission-actions.ts` for both backends and the frontend.
- **`scopes`** — Defines the two exclusive scopes: `tenant` (bare keys) and `platform` (keys prefixed `platform.`). A caller resolves to exactly one; a bare key is never satisfied by a platform caller and vice versa.
- **`keys`** (array) — Each entry declares: `key`, `module`, `subject` (singular CASL type), `action`, `scope`, `description`, and optionally `conditions`, `stepUp` (`critical` | `sensitive`), and `shopperOnly`. Key shape is always `<family>.<breadth>.<action>` with breadth (`self`/`any`) always explicit. No wildcards exist.
- **`conditions`** (per key) — ABAC filter fragments compiled into the read query. Use `$caller.<field>` substitution; field names are model-level, not storage-level. Tenancy (`tenantId`) is injected by the resolver and never written here.
- **`stepUp`** (per key) — Marks actions that require re-authentication within a time window (`NODE_REAUTH_TIME_CRITICAL` / `NODE_REAUTH_TIME_SENSITIVE`). Declared on the key, not the route.
- **`shopperOnly`** (per key) — Excludes a key from the "holds every declared key" set so that `admin` remains unrestricted while the key is restricted to customer accounts.

## Relationships

- **`shared/authorization-roles.yaml`** — Defines roles (sets of keys assignable at runtime). Role assignment validates membership against the keys declared here; a key not present in this file cannot be granted. This file is the "permissions are code" side; the roles file is the "roles are data" side.
- **`shared/authorization-conformance.yaml`** — Declares conformance rules (e.g. every tenant-scope key has a `platform.` counterpart where applicable, breadth consistency across a family, condition symmetry between `self` and `any` reads). It references the keys and actions defined here to validate structural invariants.

## Notes

- **Generated file — do not edit by hand.** Introduce or change keys in the owning module's `src/modules/<name>/authorization.yaml`, then re-run `npm run authorization:bundle`.
- **Committed byte-identical** in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`. Both repos exclude it from their formatters (`.prettierignore` / `dprint.json`) to prevent silent divergence.
- **Breadth is mandatory in the key name.** There is no implicit default: an omitted `self`/`any` is treated as a bug.
- **`deletedAt: null`** appears only on `self`-breadth reads of families that use soft-delete (Product, Order). It is intentionally absent on `any`-breadth reads (staff see soft-deleted rows) and on families with no soft-delete column (e.g. Payment).
- **`manage` is not an action.** Without wildcards, a "manage everything in this family" grant has no single key to bind to; it must be expressed as the explicit set of keys.
- **`write` was rejected** because it collapses create/update/delete, which the domain requires to be separable (e.g. a support agent may `update` a user but not `delete` one).
