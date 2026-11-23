---
source: shared/rules/authorization-roles.yaml
source_sha256: 867b49fa088864c0c06db4f44d4b2272ee4898a8273bb15fe20f63ea83b96ac0
context_sha256: 40c45428bf322dc335cd140612d80c73502687c118a8630c62a041ecb01b35d6
generated_at: 2026-11-22T02:25:16.589521+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/authorization-roles.yaml

## Purpose
Defines the preset staff roles and the permission sets each one lists. It is committed byte-identical in `boilerplate-node-backend` and `boilerplate-php-laravel-backend` and read by both seeders, so the two implementations produce the same shop (not just implementations that pass the same tests). Deployments start with these roles and may edit them afterwards. They are a starting point, not a schema.

## Key elements
- `version: 1` – file format version.
- `roles[]` – each entry has `name`, `scope` (`tenant` or `platform`), `title`, `description` and `sets` (a list of permission set names). `system` also has `assignable: false`.
- Tenant roles:
  - `manager` – catalogue, orders, locales, translations, payments (read), stats, inventory (read), delivery start, returns, tasks (read), webhooks, examples.
  - `warehouse` – product read, order read, inventory, deliveries, returns receiving.
  - `support` – tasks, users (display and edit), orders and payments (read), returns (read and answer).
  - `editor` – products, locales and translations (full management).
  - `moderator` – users (display, create, edit, ban, erase), orders (read and edit), payments (record and refund), returns. Has `ExampleDisplay` instead of authoring only.
  - `admin` – every tenant set the `customer` audience does not already give, listed by name, including `RoleManagement`. Its list is anchored as `&admin_sets`.
  - `system` – reuses the list via `*admin_sets`. It is the principal for background and scheduled work, and is not assignable.
- Platform role: `operator` – runs the installation (health, metrics, operational audit). It is explicitly not a super-admin. The file content shown ends partway through this role.

## Relationships
- `shared/authorization-keys.generated.yaml` – declares the rules and sets that the roles list by name. A set that no role lists grants nothing, and the generated file's closing note explains this.
- `shared/cases/authorization.cases.yaml` – the shared test cases that make both implementations agree. This file adds the part they don't cover, which is the seeded roles.
- `shared/scenarios/personas.yaml` – each tenant role except `admin` is a demo persona run against every screen, so the demo exercises the permission model.
- `src/modules/access/openapi.yaml` – the access module's API contract. This file shows no direct references to it.

## Notes
- A staff role is only a list of sets, with no level or rank. An account holds at most one stored role per scope.
- Staff roles are only handed out, and staff accounts only changed, by a holder of `assign:Role` (the `RoleManagement` set). Staff without it can change customers only.
- Every signed-in account also gets the computed `audience` rules (`guest`, `unverified` or `customer`). These are never stored or granted, and are unioned with the staff role. API keys get the `guest` rules plus whatever they were minted with.
- There are no wildcards. Whether a rule reads own rows or all rows depends on the action (`read:Order` is own, `display:Order` is all).
- `admin` is tenant-scoped only. No role spans both scopes. The comments say a test (`tests/cross-cutting/authorization-keys.test.ts`, `isUnrestrictedRole`) refuses any declared tenant rule that `admin`'s list omits.
- `system` is not an audit-label shortcut. The `system` label comes from the caller ID being the literal `system` (`Caller.system`), so granting the role to a real account would create an admin twin logged as `admin`.
- The `admin` and `system` lists share one YAML alias, so they cannot drift apart.
