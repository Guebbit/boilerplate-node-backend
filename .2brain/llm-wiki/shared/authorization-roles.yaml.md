---
source: shared/authorization-roles.yaml
sha256: 1321239fb59d68090c5b58eeefc929ddb2a31c90b923ae31618b2ad06f38fad4
generated_at: 2026-10-14T07:35:02.929464+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-roles.yaml

## Purpose

Defines the preset tenant-scope roles (who can do what in a shop) as a single canonical YAML document. It is committed byte-identical into both the Node and PHP backend boilerplates and read by both seeders at setup, ensuring two independently-stored permission systems (a `spatie/laravel-permission` table vs. a Node equivalent) produce the same product on day one. It is a starting point for a deployment, not a fixed schema.

## Key elements

- **`version`** — Schema version (`1`); gates how seeders interpret the document.
- **`roles[]`** — Array of role objects. Each carries:
  - `name`, `scope` (`tenant`), `title`, `level` (`user` | `staff` | `admin`)
  - `description` — Human-facing explanation of the role's intent.
  - `signupDefault: true` — Present on exactly one role (`unverified`); read by `access/service.ts` (`SIGNUP_DEFAULT_ROLE`) and enforced at boot by `kernel/permissions.ts`.
  - `promotesTo` — Target role name after the verification flow (e.g. `unverified → customer`).
  - `permissions[]` — Explicit list of authorization keys (see `shared/authorization-keys.yaml`). No wildcards; breadth is encoded in the key itself (`.self.` vs `.any.`).
- **Defined roles (tenant scope):** `unverified`, `customer`, `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin` (truncated in source but implied by the header comment that admin lists every tenant key by name).
- **Level semantics** — A second check layered on top of key grants: for write operations on another person's resource, the owner's level must be strictly below the caller's. A person holding multiple roles is evaluated at the highest level.
- **Shopper-only keys** — `cart.self.update` and `cart.self.checkout` are held only by `unverified`/`customer`; no staff or admin role owns a basket, order, payment, or return.

## Relationships

- **`shared/authorization-keys.yaml`** — The `permissions` entries in each role reference keys declared in that file. The closing note in `authorization-keys.yaml` reinforces the "a key nothing lists grants nothing" rule that this file's no-wildcard policy enforces.
- **`shared/authorization-conformance.yaml`** — Defines the structural invariants (e.g. exactly one `signupDefault`, level hierarchy) that both this file and the seeders must satisfy; this file is the data that conformance checks validate.

## Notes

- **No wildcards, ever.** Breadth lives in the key name (`<family>.self.*` vs `<family>.any.*`). `admin` is no exception—it enumerates every tenant key explicitly.
- **Level is additive, not替代.** A route still requires its named key; `level` only gates the "acting on someone else's thing" case. A role can hold a key but still be blocked by level, and vice-versa.
- **Staff do not shop.** If a staff member needs to buy, they use a separate customer account. This is a design invariant, not a suggestion.
- **`unverified` is thinner by exactly one key** (`cart.self.checkout`) compared to `customer`; everything else is the same. Browsing, wishlist, address book, and account pages require no key at all (they follow from being signed in).
- **Demo coupling.** Every tenant role except `admin` is a demo persona exercised against all screens in `docs/demo-ecommerce/`. Changing a role's permission set affects demo coverage.
- **`operator` (admin level)** is not a tenant role in this list; it sits at the admin level so no tenant role can act on the installation's own account.
- **Idempotent seeding.** Because both backends read this file verbatim, the seeders must treat it as read-only input. Do not fork or restated it per implementation.
