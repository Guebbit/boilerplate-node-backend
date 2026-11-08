---
source: shared/authorization-roles.yaml
sha256: 4178ed926dc3e183f25c1b1ff34dac7b5e232e3f593ad9e8ee980b4243744887
generated_at: 2026-11-08T03:04:38.903012+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-roles.yaml

## Purpose

Defines the preset roles and their permission-set assignments for a multi-tenant e-commerce platform. It is committed byte-identical in the Node and PHP/Laravel boilerplate backends so that both seeders produce the same product on day one, rather than each restating (and potentially diverging on) the same role definitions. It is a starting-point matrix, not a schema: deployments may edit it after initial seeding.

## Key elements

- **`version`** — Integer (currently `1`) for forward-compatibility of the format.
- **`roles`** — Ordered list of role objects, each with:
  - `name`, `scope` (`tenant` | `platform`), `title`, `description`.
  - `sets` — The explicit list of permission-set names the role holds. No wildcards anywhere.
  - `assignable` (optional, `false` only for `system`) — Prevents the role from being granted to any account.
- **Tenant-scope roles** — `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin`, `system`. Each maps to a demo persona (except `admin` and `system`).
- **Platform-scope roles** — `operator` (and possibly further entries below the truncation point). Distinct from tenant roles; a single role cannot span both scopes.
- **YAML anchor / alias** — `&admin_sets` on `admin.sets` and `*admin_sets` on `system.sets` make both entries reference the same parsed array, so they cannot drift apart.
- **`audience` concept** (documented in the header comment, not a YAML key here) — `guest` / `unverified` / `customer` are computed per request and unioned with the stored staff role; they are never stored or granted.

## Relationships

- **`kernel/permissions.ts`** — Supplies the `Caller.system` identifier that background/scheduled work uses as its caller ID (the `system` role's only caller, per the file's own note). The permission rules and set definitions referenced by `sets:` are declared in `authorization-keys.yaml` (not a listed neighbor, but the file's comments reference it as the companion rules file).

## Notes

- **No wildcards, ever.** Every set a role holds is listed by name, including `admin`. A set that no role lists grants nothing — this is enforced by the conformance suite.
- **`system` is not assignable.** `assignable: false` means no request may grant it. The audit `system` label comes from the caller ID string, not from role membership; granting it to a real account would just create an admin twin.
- **`audience` is orthogonal to roles.** A staff member is simultaneously a `customer` (reads own orders, fills a basket) *and* a staff member. The audience is computed per request; an API key gets only `guest` + its minted sets, never its minter's audience.
- **Conformance suite coupling.** The suite asserts that `admin`'s list covers every declared tenant rule not already in `customer`'s audience, and that `operator` holds no staff rule. Adding a new set without listing it in `admin` will fail the suite.
- **Scope separation is structural.** Tenant and platform roles live in the same list but are never mixed; the conformance suite enforces that `operator` cannot read a shop's orders, customers, or messages.
