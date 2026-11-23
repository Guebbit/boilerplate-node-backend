---
source: shared/contracts/authorization-keys.root.yaml
source_sha256: a7592ab198ffd6410da01a456b72cc2064d5b933e5f52067eff75a7b6746063e
context_sha256: ef1bf1698bf4a1ea79816a060f34fead9b1e78ea57bd5c822f7c218473544425
generated_at: 2026-11-22T02:23:33.586494+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/contracts/authorization-keys.root.yaml

## Purpose
The root residual of the shared authorization contract: it holds the app-level pieces of "every permission rule and permission set that exists" (the `core` rules, the action vocabulary, scopes, step-up tiers, and the documentation of the model). `npm run regenerate` splices it together with one fragment per module (`src/modules/<name>/authorization.yaml`) to produce the bundle. It exists so rules are code, not data: roles may be created at runtime, but a rule can only be introduced here or in a module fragment, and role assignment validates against the resulting file.

## Key elements
- `version: 1` — contract version.
- `actions` — the single home of the action vocabulary: `read, create, update, delete, checkout, sweep, override, start, receive, ban, export, assign, display, admin`. `manage` and `write` are deliberately absent. Each non-CRUD verb is justified in comments. `npm run gen:api` turns this list into a generated permission-vocabulary file (and the frontend copy).
- `implies` — staff actions that also answer plain ones: `display` → `read`; `admin` → `update`, `delete`. This lets one query serve both staff and own-rows rules.
- `scopes` — exactly two: `tenant` (content belonging to one shop) and `platform` (shared operational data across shops). A caller resolves to exactly one.
- `stepUp` — window in seconds per tier: `critical: 300`, `sensitive: 900`. A rule may declare `stepUp: critical | sensitive`, and `requirePermission` then demands a recent sign-in. `npm run regenerate` writes a generated step-up file from it. The `NODE_REAUTH_TIME_*` env vars override these defaults.
- `# %AUTHORIZATION_RULES%` and `# %AUTHORIZATION_SETS%` — placeholder markers where the module fragments' rules and permission sets are spliced in.
- Comment-documented rule fields (not defined in this file): `conditions`, `credential: false`, `stepUp`.

## Relationships
- `shared/authorization-keys.generated.yaml` is the generated bundle: this root file plus the module fragments. Per the header, `--check` (wired into `complete`) fails the build if the bundle drifts from its sources.
- The file is committed with identical bytes in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`.

## Notes
- Edit this file and the module fragments, never the generated bundle. New rules and sets belong in their owning module's fragment.
- Excluded from formatters (see the exclusion in `.prettierignore` and the formatter config) so two formatters don't silently fork a shared artefact.
- The invariant: a tenant rule can never be satisfied by a platform-scope caller, and vice versa. A platform operator is not a super-member, so there is no single `admin` boolean.
- No wildcards: there is no `manage` and no `all`. Rule ids are `<action>:<subject>` and are unique. A guard asks only `(action, subject)`.
- Roles are lists of permission sets, defined outside this file (in `authorization-roles.yaml`, per the comments); `admin` lists every set explicitly.
- "Own rows" is a condition (`userId: $caller.id`), not a name such as `self` or `any`. Placeholders are limited to `$caller.<field>`, and there is no expression language. Tenant conditions (`tenantId: $caller.tenantId`) are injected by the resolver and never written in rules.
- Condition field names are the model's own, and each backend maps them to its own columns.
- `deletedAt: null` appears on narrow reads (`Product`, `Order`) but not on wide reads, so staff can still see and restore soft-deleted rows. `Payment` has no such column or condition.
- A rule with `stepUp` or platform scope can never be minted into an API key. `credential: false` also blocks minting.
- `wishlist` and `account` deliberately have no rules, and `cart` has only `checkout:Cart`.
