---
source: shared/authorization-keys.yaml
sha256: 4e737332d981c0892323e1abb7104442426e8b697fc7838792aab3701cc653be
generated_at: 2026-09-23T17:33:11.606233+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-keys.yaml

## Purpose

Single, canonical registry of every permission key in the system. It is the only place a key may be introduced and the only place assignment validates against. It is committed with identical bytes in both backend boilerplates (`boilerplate-node-backend`, `boilerplate-php-laravel-backend`) and is explicitly excluded from both formatters to prevent a silent fork.

## Key elements

- **`version`** — integer, currently `1`; bump on breaking schema changes.
- **`actions`** — closed list of verbs a key may use: `read`, `create`, `update`, `delete`, `checkout`, `sweep`, `override`. `write` and `manage` are deliberately absent.
- **`scopes`** — the two mutually exclusive caller scopes: `tenant` (bare keys) and `platform` (`platform.`-prefixed keys). A caller resolves to exactly one.
- **`keys`** — the array of permission definitions. Each entry carries `key` (dot-shaped ID), `module`, `subject` (CASL type), `action`, `scope`, `description`, and optionally:
  - `conditions` — ABAC filter fragment (e.g. `active: true`, `deletedAt: null`, `userId: $caller.id`) compiled into the read query; no expression language, only `$caller.<field>` substitution.
  - `stepUp` — `critical` or `sensitive`; forces a re-authentication window before the action is permitted.
  - `deniedCode` — i18n code used in the 403 response body instead of the generic message.

## Relationships

- **`shared/authorization-roles.yaml`** — roles reference keys defined here. A role is an assignment of keys; it cannot introduce a key that is absent from this file. Validation runs against this registry, not against free-form strings.
- **`shared/authorization-conformance.yaml`** — conformance checks verify that every key actually used in code or in a role definition appears in this file and that the declared shape (`family.breadth.action`) is well-formed.

## Notes

- **No wildcards, no `manage`.** A key grants exactly what its name says. There is no per-family or scope-wide grant.
- **Breadth is mandatory.** `self` or `any` always appears in the key. An omitted breadth is treated as a bug, not a default.
- **Byte-identity is load-bearing.** The file must never be reformatted. It is excluded from `.prettierignore` and `dprint.json` for this reason.
- **Tenancy is not in `conditions`.** `tenantId: $caller.tenantId` is injected by the resolver on every tenant-scope rule; no key can omit it and no request parameter can override it.
- **Field names are the domain model's, not the storage schema's.** Each backend maps `userId` → `user_id` (or equivalent) when building its own query.
- **Keyless modules are intentional.** `wishlist`, `account`, and most of `cart` have no keys because access follows from authentication (being the owner), not from a role.
- **`checkout` vs `create` on Order.** `cart.self.checkout` is distinct from `orders.any.create`; reusing `create` would produce an identical CASL tuple once packed for the client.
- **`deletedAt: null` appears only on `self` reads.** Soft-deleted rows remain visible to `any`-breadth staff reads. Payments have no such column and carry no such condition.
