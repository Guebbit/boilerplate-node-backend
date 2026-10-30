---
source: shared/authorization-keys.yaml
sha256: ab7201739d337f5ce0b6eab91440050e5a21becbfb7d78a86cbe4e035f3cd455
generated_at: 2026-10-29T01:46:38.996240+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-keys.yaml

## Purpose

Generated bundle of every permission rule and permission set in the system, spliced from per-module fragments (`src/modules/<name>/authorization.yaml`) by `npm run regenerate`. It is the single source of truth for the authorization vocabulary (actions, implies, scopes, step-up tiers) and the concrete rules that guards evaluate. Committed byte-identical in both `boilerplate-node-backend` and `boilerplate-php-laravel-backend`; `--check` (wired into `complete`) fails the build if the bundle drifts from its source fragments.

## Key elements

- **`actions`** — Closed vocabulary of all valid verbs (CASL CRUD plus domain-specific additions: `checkout`, `sweep`, `override`, `start`, `receive`, `ban`, `export`, `assign`, `display`, `admin`). `npm run gen:api` emits this into `api/permission-actions.ts` for both frontends. No `manage` or `write` wildcard exists.
- **`implies`** — Maps staff actions to the plain actions they also satisfy (`display → read`, `admin → update, delete`). The ability engine emits each implied rule alongside the staff rule so a single query filter covers both.
- **`scopes`** — The two mutually exclusive caller scopes: `tenant` (one shop) and `platform` (shared operational data). A caller resolves to exactly one; a rule's scope must match the caller's scope.
- **`stepUp`** — Re-authentication tier windows in seconds (`critical: 300`, `sensitive: 900`). Rules opt in via `stepUp: critical|sensitive`. `npm run regenerate` writes `src/kernel/step-up.generated.ts` from these values. Environment variables override the defaults.
- **`rules`** — The permission rules themselves. Each rule has `action`, `subject`, `module`, `scope`, optional `description`, optional `conditions` (ABAC filter fragments using `$caller.<field>` placeholders), optional `stepUp`, optional `credential` flag. Tenancy is injected by the resolver, never written here.
- **Conditions** — ABAC filter fragments compiled *into* the query (not checked after). Field names are the model's vocabulary, not either storage's columns. `deletedAt: null` appears on narrow reads of soft-deletable subjects.

## Relationships

- **`shared/authorization-roles.yaml`** — Roles are lists of permission sets by name; the sets and their constituent rules are declared here. A role file never re-declares a rule or action.
- **`shared/authorization-conformance.yaml`** — Conformance checks validate that the rules declared in this file are consistent (e.g., every `implies` target exists, every condition field is mappable, every rule's scope is one of the two declared scopes).

## Notes

- **Generated, never hand-edited.** `--check` fails CI if the bundle's bytes differ from re-splicing the fragments. Edit the owning module's `src/modules/<name>/authorization.yaml` instead.
- **Formatter-excluded.** Both repos' formatters (Prettier / dprint) skip this file (`.prettierignore`, `dprint.json`). Two formatters over one shared artefact would silently fork the file.
- **No wildcards, no `manage`.** The model explicitly forbids per-family or scope-wide wildcards. A rule names exactly one action on one subject.
- **Roles are data, permissions are code.** A deployment may create roles at runtime (in `authorization-roles.yaml`) but may never invent a new rule; assignment validates against this file.
- **`credential: false` and `stepUp` rules are not mintable.** A credential cannot re-authenticate, and a rule nothing checks grants nothing.
- **`scope` is a field, not a naming convention.** The invariant — tenant rule never satisfied by platform caller and vice versa — is enforced by the field, not by subject naming.
- **Subjects are singular CASL types** (`Order`, `Product`), distinct from the plural module folder names.
