---
source: shared/authorization-keys.yaml
sha256: f935bd406ec6c416d0354dc342f86f4cd6a18b3bdee56ed52fffa122f869b14f
generated_at: 2026-09-27T14:01:11.779999+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-keys.yaml

## Purpose

The single canonical registry of every permission key in the system. A key may only be introduced here; deployment-time role assignment validates against this file rather than against free-form strings. The file is committed byte-identical in `boilerplate-node-backend` and `boilerplate-php-laravel-backend` and is excluded from both formatters to prevent a silent fork.

## Key elements

- **`actions`** — Closed vocabulary of allowed verbs: `read`, `create`, `update`, `delete`, plus four domain-specific additions (`checkout`, `sweep`, `override`, `start`). `write` and `manage` are deliberately absent.
- **`scopes`** — Two mutually exclusive scopes: `tenant` (bare keys, one shop's data) and `platform` (keys prefixed `platform.`, shared operational data).
- **`keys`** — The permission entries. Each key carries `key`, `module`, `subject`, `action`, `scope`, `description`, and optionally `conditions`, `stepUp`, and `deniedCode`.
- **Key shape** — `<family>.<breadth>.<action>` where breadth is always explicit (`self` or `any`). No wildcards of any kind.
- **`conditions`** — ABAC filter fragments (e.g. `active: true`, `userId: $caller.id`) that must also hold of the row. Uses a single placeholder grammar (`$caller.<field>`); no expression language.
- **`stepUp`** — Optional tier (`critical` | `sensitive`) that requires the caller to re-authenticate within a window before the action is permitted.
- **`deniedCode`** — Optional i18n key for a specific 403 message (e.g. `EMAIL_NOT_VERIFIED` on `cart.self.checkout`).
- **`version`** — Currently `1`; versioning bump for schema evolution.

## Relationships

- **`shared/authorization-roles.yaml`** — Roles defined there assign subsets of the keys declared here. Assignment is validated against this file's key list, so a role cannot reference a key that does not exist in this registry.
- **`shared/authorization-conformance.yaml`** — Conformance rules that check structural invariants of the keys (e.g. scope/breadth consistency, presence of required fields). The keys file is the data those rules operate on.

## Notes

- **No wildcards.** There is no per-family or scope-wide grant. `manage` is not an action and grants nothing.
- **Breadth is mandatory.** An omitted breadth is treated as a bug. `self` means the key is genuinely scoped to the caller's own rows (or the default narrow reading a family gives a customer); `any` covers everything else, including keys with no owner to scope by.
- **Tenancy is injected, not written.** Every tenant-scope rule gets `tenantId: $caller.tenantId` added by the resolver; no key declares it explicitly and no request parameter can supply it.
- **`deletedAt: null` is asymmetric.** Present only on `self`-breadth reads of subjects that have the column (`Product`, `Locale`, `Order`). Staff (`any`-breadth) see soft-deleted rows; customers do not. `Payment` has no such column and no such condition.
- **Keyless modules are intentional.** `wishlist`, `account`, and most of `cart` have no keys because they are the caller's own data, gated by signed-in identity rather than by role. The sole exception is `cart.self.checkout`, which protects an account-level fact (address verification).
- **Field names are the model's, not the storage's.** Conditions use the domain vocabulary; each backend maps them to its own column names when compiling a query.
- **The file is formatter-excluded** in both repos (`.prettierignore` / `dprint.json`) for the same reason `spectral.yaml` is excluded: two formatters over one shared artefact produces a silent fork.
