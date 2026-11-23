---
source: shared/authorization-keys.generated.yaml
generated_at: 2026-11-22T02:20:40.239158+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/authorization-keys.generated.yaml

## Purpose
The single, generated catalogue of every permission rule and permission set in the app. It is the source of truth for authorization: roles are data created at runtime, but permissions are code, so role assignment validates against this file rather than against arbitrary strings. It is committed byte-identical in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`, and is excluded from both repos' formatters (via `.prettierignore` and the other repo's formatter config) to avoid a silent fork.

## Key elements
- **`version`**: schema version (`1`).
- **`actions`**: the closed action vocabulary: `read`, `create`, `update`, `delete`, `checkout`, `sweep`, `override`, `start`, `receive`, `ban`, `export`, `assign`, `display`, `admin`. There is no `manage`, `write`, or wildcard. A verb is added only when CRUD cannot express it. The header says `npm run gen:api` turns this list into a generated permission vocabulary (and the frontend's copy).
- **`implies`**: staff actions that also answer plain ones. `display` implies `read`. `admin` implies `update` and `delete`. This keeps one query serving both the own-rows and staff cases.
- **`scopes`**: `tenant` (content belonging to one shop) and `platform` (shared data across shops). A caller resolves to exactly one.
- **`stepUp`**: re-authentication windows in seconds (`critical: 300`, `sensitive: 900`). Rules opt in with `stepUp: critical|sensitive`. The header says `npm run regenerate` writes a generated step-up module from these values.
- **`rules`**: the rule list. Each rule has `action`, `subject`, `module`, `scope`, `description`, and optional `conditions`. Its id is `<action>:<subject>` and must be unique. The visible entries are the `products` module's `read`, `display`, `create`, `update` and `delete` rules on `Product`, followed by the start of the `cart` section (`checkout:Cart`).
- **Rule-level flags (documented in comments)**: `credential: false` (the rule cannot be minted into an API key), `stepUp`, and `conditions`.
- **Conditions**: a filter fragment, such as `active: true`, `deletedAt: null` or `userId: $caller.id`. `$caller.<field>` is the only placeholder, and there is no expression language. Field names are the model's own, and each backend maps them to its columns.
- **Permission sets**: named per-module bundles of rules (e.g. `OrderDisplay`). The header says they are declared beside the rules. Their section is not visible in the content shown.

## Relationships
- **`shared/rules/authorization-roles.yaml`**: roles list permission sets and nothing else. Their assignments validate against the sets declared here.
- **`shared/contracts/authorization-keys.core.yaml`** and **`shared/contracts/authorization-keys.root.yaml`**: these are the root residual for app-level `core` rules and the contracts for the bundle. The header says the file is spliced from per-module fragments (`src/modules/<name>/authorization.yaml`) plus the root residual, and `--check` fails the build on drift.
- **`shared/cases/authorization.cases.yaml`** and **`shared/cases/permission-model-version.cases.yaml`**: test cases exercising the model and its version.
- **`shared/rules/audit-actions.yaml`**: a sibling shared rules file.

## Notes
- **Do not edit by hand.** Introduce a rule or set in its owning module fragment and run `npm run regenerate`. `--check` (wired into `complete`) fails the build on drift.
- **No `self`/`any` in names.** "Own rows" is a condition (`userId: $caller.id`). Staff versus own-rows is expressed by the action: `display` is every row where `read` is my rows, and `admin` is any row where `update`/`delete` are mine.
- **Scope invariant.** A tenant rule can never be satisfied by a platform-scope caller, and a platform rule can never be satisfied by a tenant-scope caller. A platform operator is not a super-member.
- **Tenancy is injected, not written.** The resolver adds `tenantId: $caller.tenantId` to every tenant-scope rule.
- **Soft-delete asymmetry.** `deletedAt: null` appears on the narrow reads (`Product`, `Order`) and not on the wide ones, so staff can still see and restore deleted rows. `Payment` has no such column or condition.
- **Mintability.** Rules with a `stepUp` tier, and platform rules, are never mintable as API keys. A rule can also opt out with `credential: false`.
- **Intentionally rule-less modules.** `wishlist` and `account` have no rules because they are the caller's own things. `cart` contents are also ruleless, with `checkout:Cart` as the one exception.
