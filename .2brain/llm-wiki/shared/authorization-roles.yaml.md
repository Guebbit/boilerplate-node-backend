---
source: shared/authorization-roles.yaml
sha256: 23aacece2a7be06954d4b0f94d057d8ec9072709ba70f74c0e109c56506003a7
generated_at: 2026-09-27T14:01:24.390242+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-roles.yaml

## Purpose

Defines the preset roles and the exact permission keys each one holds, serving as the single source of truth committed byte-for-byte into both `boilerplate-node-backend` and `boilerplate-php-laravel-backend`. It exists so the two independently-stored implementations (PHP via `spatie/laravel-permission`, Node via a different mechanism) produce the same *product*, not merely the same test results. Roles are a deployment starting point, not a fixed schema.

## Key elements

- **`roles`** — Ordered list of role definitions. Each entry has `name`, `scope` (`tenant` or `platform`), `title`, `description`, and a flat `permissions` array of key strings.
  - *Tenant roles:* `unverified`, `customer`, `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin`.
  - *Platform role:* `operator` (observability only; explicitly not a super-admin).
- **`anonymous`** — The role every unauthenticated request resolves to (`name: guest`). Holds only `products.self.read`, `locales.self.read`, `delivery.any.read`.
- **`version`** — Currently `1`; versioning knob for future changes to the role set.

## Relationships

- **`shared/authorization-keys.yaml`** — Declares the full key vocabulary referenced by every `permissions` list here. That file's closing note establishes that a key no role lists grants nothing, which is why `admin` must enumerate every tenant key explicitly.
- **`shared/authorization-conformance.yaml`** — The conformance suite both backends run against. It refuses a declared tenant key that `admin`'s list omits, and asserts `operator` holds no bare (non-`platform.*`) key. This file is the input that suite validates.

## Notes

- **No wildcards, ever.** Breadth is encoded in the key name itself (`<family>.self.*` vs `<family>.any.*`). `admin` lists every tenant key by name for the same reason every other role does; there is no `*` or implicit "all" grant.
- **`unverified` is the only tenant role lacking `cart.self.checkout`.** Granting any staff role *is* the vouching; `cart.self.checkout` is therefore held explicitly by every role except `unverified`.
- **Committed identically in both boilerplates.** Seeders read this file rather than restating roles inline, so a change in one repo is a change in both.
- **`anonymous`/`guest` is a named model value**, not a null sentinel. Any code path that skips role resolution should route through it.
- **Product writes are stacked:** a role that edits a listing needs both `products.any.update` *and* `translations.any.update` (or `.any.read`) because translations are a separate key family.
- **Roles double as demo personas** (`docs/demo-ecommerce/`) — every role except `admin` is exercised against every screen in the demo, so the permission model is tested by usage, not only by its own test suite.
