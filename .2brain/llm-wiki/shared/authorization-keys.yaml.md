---
source: shared/authorization-keys.yaml
sha256: 076ca9827751293b637b7d60d4737e7bd3aa90802f31b6e09e036546e3ab4235
generated_at: 2026-10-01T12:42:27.354977+00:00
model: ollama:qwen3.8:27b
---

# shared/authorization-keys.yaml

## Purpose
The single source of truth for every permission key, the action vocabulary, the two scopes, and the ABAC condition grammar shared by both backends. It is **generated** by `npm run authorization:bundle` (spliced from per-module `authorization.yaml` fragments plus a root residual) and committed byte-identically in `boilerplate-node-backend` and `boilerplate-php-laravel-backend`. A deployment may create roles at runtime but may never invent a key; assignment validates against this file, not against a free-form string.

## Key elements

- **`actions`** — Closed list of verbs (`read`, `create`, `update`, `delete`, `checkout`, `sweep`, `override`, `start`, `receive`). `write` and `manage` are deliberately absent. This list is the one home of the vocabulary; `npm run gen:api` compiles it into `api/permission-actions.ts` for both frontends.
- **`scopes`** — Exactly two: `tenant` (bare keys) and `platform` (`platform.`-prefixed keys). A caller resolves to one or the other; they are never both and never derived from a flag.
- **Key entries (`keys`)** — Each declares `key`, `module`, `subject` (CASL type), `action`, `scope`, `description`, optional `conditions`, `stepUp`, and `deniedCode`. Shape is always `<family>.<breadth>.<action>`; breadth (`self` / `any`) is mandatory.
- **`conditions`** — Optional ABAC filter (same shape CASL takes as its third argument). Placeholder grammar is `$caller.<field>` only; no expression language. Field names are the domain model's, not either storage's.
- **`stepUp`** — Optional `critical` | `sensitive` tier on a key that triggers re-authentication via the existing `REAUTH_TIME_*` tiers. Declared on the key, not the route, so every path that reaches the action inherits the challenge.
- **`deniedCode`** — Optional i18n key (e.g. `EMAIL_NOT_VERIFIED`) that overrides the generic 403 message for a specific key.

## Relationships

- **`shared/authorization-roles.yaml`** — Roles reference keys defined here. Assignment validates against this file's key set, so a role can never grant a key that does not exist.
- **`shared/authorization-conformance.yaml`** — The `--check` flag (wired into `complete`) uses conformance rules to fail the build if the bundled keys drift from the per-module fragments, enforcing that this file is always the faithful splice.

## Notes

- **Do not edit by hand.** A key is introduced in its owning module fragment (`src/modules/<name>/authorization.yaml`), never in this bundle directly.
- **No wildcards of any kind** — not per-family, not scope-wide. `manage` names nothing because there is nothing for it to collapse.
- **Tenancy is injected, not written.** Every tenant-scope rule gets `tenantId: $caller.tenantId` from the resolver; no key carries it and no request parameter can supply it.
- **`deletedAt: null` asymmetry is intentional.** It appears only on `self`-breadth reads of subjects that have soft-delete (`Product`, `Locale`, `Order`). The `any`-breadth reads intentionally see soft-deleted rows. Matching `null` covers both "column absent" and "column set to nothing."
- **`cart` is nearly keyless.** Its single exception, `cart.self.checkout`, is a fact about the account (address verified), not the basket contents.
- **Formatters excluded.** `.prettierignore` / `dprint.json` exclude this file (same rationale as `spectral.yaml`): two formatters over one shared artefact causes a silent fork between the two repos.
- **`subject` vs. key family.** The first segment of the key is the resource *family* (plural, matches the module folder); `subject` is the singular CASL type. They differ on purpose.
