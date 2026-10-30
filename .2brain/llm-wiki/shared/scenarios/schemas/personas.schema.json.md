---
source: shared/scenarios/schemas/personas.schema.json
sha256: 83d31c059ff7108eaafa7eb554f52f3bb61864252ab38bd9e395c545bd1429a2
generated_at: 2026-10-29T01:49:14.267881+00:00
model: ollama:qwen3.8:27b
---

# shared/scenarios/schemas/personas.schema.json

## Purpose

JSON Schema (draft 2020-12) that defines the shape of test-scenario persona data. It constrains the credential, membership, and account-state fields for each named persona (admin, user, editor, moderator, unverified) so that scenario fixtures are validated before use.

## Key elements

- **`staffTotpSecret`** – Top-level optional string (min length 1) for a staff TOTP secret used in scenario setup.
- **`accounts`** – Object holding the named persona slots. Currently defined slots: `admin`, `user`, `editor`, `moderator`, `unverified`.
- **Persona shape** (shared across all slots) – Each persona requires:
  - `email` – string with `format: email` plus a strict regex pattern.
  - `username` – non-empty string.
  - `defaultPassword` – non-empty string.
  - `memberships` – array of `{ scope, role }` objects; `scope` is restricted to `"tenant" | "platform"`, `role` is a non-empty string. Both keys required; no extra properties allowed.
  - `state` – object with required booleans `verified`, `active`, `twoFactor`, `authenticator`, `analyticsConsent` and a nullable `pendingEmail` (string email or `null`). No extra properties allowed.
- **`additionalProperties: false`** – Enforced at every level (persona, memberships item, state) to reject unknown fields.

## Relationships

No graph neighbors are recorded for this file. It is a standalone schema definition with no imports, `$ref` external links, or sibling schema references in the provided content.

## Notes

- The `admin` and `user` blocks (and by extension `editor`, `moderator`, `unverified`) are structurally identical in this schema — no per-role field differences are encoded. Differentiation between personas is purely by key name, not by schema shape.
- The email regex pattern is repeated inline for every `email` and `pendingEmail` field rather than using a shared `$defs`/`$anchor` entry, so updating the pattern requires editing multiple locations.
- `pendingEmail` is the only field in `state` that permits `null`; all other state fields are strict booleans.
- The file is truncated in the source snapshot; the `unverified` persona and any additional slots beyond it are not fully visible.
