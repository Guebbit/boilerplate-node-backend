---
source: shared/authorization-roles.yaml
sha256: e37a9e383007526fdc09e1b718708528bcc92975540cc0b75609a41d3acf7f10
generated_at: 2026-10-01T12:42:40.615322+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-roles.yaml

## Purpose

Defines the preset tenant roles and the exact set of permission keys each one holds. It is committed byte-identical in both `boilerplate-node-backend` and `boilerplate-php-laravel-backend` so that both seeders produce the same starting permission matrix. While `authorization-keys.yaml` and `authorization-conformance.yaml` make the two backends *agree*, this file makes them the same **product**: without it, two independently written seeders could pass every conformance test yet yield different shops.

## Key elements

- **`version`** — schema version (currently `1`) for forward-compatibility of the role list.
- **`roles[]`** — array of role objects, each with:
  - `name` — machine identifier (e.g. `customer`, `manager`, `admin`).
  - `scope` — always `tenant`; no platform-scope roles exist here.
  - `title` / `description` — human-readable intent and boundary notes.
  - `signupDefault` (optional) — exactly one role may carry `true`; read by `access/service.ts` (Node) to auto-assign at registration. `kernel/permissions.ts` throws at boot if more than one role sets it.
  - `promotesTo` (optional) — the role an account is promoted to after verification (e.g. `unverified → customer`).
  - `permissions` — explicit list of key names; **no wildcards** — breadth is encoded in the key itself (`self` vs `any` segment).
- **`&admin_permissions`** — YAML anchor on `admin`'s permission list; a subsequent background/scheduled role (truncated) reuses it via `*admin_permissions` alias so audit rows can distinguish "a sweep did this" from "an admin did this."
- **Role set (tenant scope):** `unverified`, `customer`, `manager`, `warehouse`, `support`, `editor`, `moderator`, `admin`, plus at least one background/scheduled role (content truncated).

## Relationships

- **`shared/authorization-keys.yaml`** — declares the full key vocabulary. This file's `admin.permissions` must list *every* declared tenant key by name; the conformance suite rejects a declared key that `admin` omits. Key descriptions in the keys file (e.g. `cart.self.checkout`) inform the role descriptions here.
- **`shared/authorization-conformance.yaml`** — the conformance suite reads this file to verify that both backends' seeded roles match the declared list. It enforces that `admin` covers all keys and that `signupDefault` uniqueness holds.

## Notes

- **No implicit grants.** A key not listed in a role's `permissions` is not granted — even for `admin`. Adding a new key to `authorization-keys.yaml` without adding it to `admin`'s list is a deliberate omission, not a default.
- **`cart.self.checkout` is the only key `unverified` lacks.** Every other staff and customer role holds it explicitly; there is no "unverified manager" because granting a role *is* the vouching act.
- **`self` vs `any` is not a wildcard mechanism.** It is a segment on the key name. A role gets `self` or `any` by explicit listing; nothing is inferred from "holding a wildcard."
- **`admin` is tenant-scoped only.** It says nothing about platform scope by design — one role cannot reach both scopes.
- **Background/scheduled roles** (truncated section) run as a distinct principal, not `admin`, so audit trails attribute automated work to the sweep/reaper rather than to a human admin.
- The file is a **starting point, not a schema**: deployments receive these roles on day one and may edit or add roles afterwards.
