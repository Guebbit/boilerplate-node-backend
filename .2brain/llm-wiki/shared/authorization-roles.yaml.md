---
source: shared/authorization-roles.yaml
sha256: d6a8542e7d2843ff907a0b36e53a14f16bc1547140b20785517e51c0a02f3e91
generated_at: 2026-10-29T01:46:50.303763+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-roles.yaml

## Purpose

Defines the preset roles (and their permission-set lists) that both the Node and PHP-Laravel boilerplate implementations seed into their stores on first deployment. It exists because the two backends store roles differently (Spatie table vs. no table), so without this shared source-of-truth their independent seeders would produce divergent products that both pass conformance tests. It is a starting point for a deployment, not a schema — roles may be edited after seeding.

## Key elements

- **`version`** — schema version (currently `1`).
- **`roles`** — the list of role definitions. Each entry has:
  - `name`, `scope` (`tenant` | `platform`), `title`, `description`
  - `sets` — an explicit list of permission-set names (no wildcards)
  - `assignable` — optional; when `false` (only `system`) the role cannot be granted to any account
- **Tenant-scope roles:** `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin`, `system`
- **Platform-scope roles:** `operator` (content truncated in source)
- **`&admin_sets` / `*admin_sets`** — YAML anchor/alias so `system`'s `sets` is literally the same parsed array as `admin`'s; they cannot drift apart by hand.
- **`audience` block** (referenced in comments, not in the YAML body) — `guest`, `unverified`, `customer` are computed per request and unioned with the held staff role; they are never stored or granted.

## Relationships

- **`shared/authorization-keys.yaml`** — declares the rules and permission sets that the `sets:` lists here reference by name. The conformance suite cross-checks that every declared tenant rule is covered by at least one role's list.
- **`shared/authorization-conformance.yaml`** — the test contract that enforces the two implementations agree on rules and sets; this file is what makes them the same *product* on top of that agreement.

## Notes

- **No wildcards, ever.** A set that no role lists grants nothing. Whether a rule reads "mine" vs. "all rows" is determined by the action keyword inside the rule (`read:Order` vs. `display:Order`), not by any role-level scope.
- **`system` is not `admin` with a hat.** It is identical in permissions via the YAML alias, but is never assignable and is identified in audit logs by the literal caller ID `"system"` (`Caller.system` in `kernel/permissions.ts`), not by role membership.
- **One role per scope, max.** A person holds at most one stored role per scope; the `audience` sets are additive and computed per request.
- **`assign:Role` (the `RoleManagement` set)** is the gate that protects accounts that hold a staff role; only its holder can assign a staff role or edit such an account.
- **Demo coupling:** every non-`admin` tenant role is a persona exercised across the demo screens (`docs/demo-ecommerce/`), so the permission model is validated by the demo, not just by unit tests.
- **Committed with identical bytes** in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`; both seeders read this file rather than restating the data.
