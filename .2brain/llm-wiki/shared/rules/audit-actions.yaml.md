---
source: shared/rules/audit-actions.yaml
generated_at: 2026-11-22T02:25:00.682128+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/audit-actions.yaml

## Purpose
Declares the audit actions that belong to no module: the ones the guards emit for requests refused before any domain saw them. Because no module could own them, they are listed here as shared rules.

## Key elements
Each entry under `actions:` has a `value` (the wire string) and a `description`. The constant's key is derived from the value: uppercase, with `.` turned into `_`.

- `security.unauthorized`: no usable credential on a guarded route, or a stale credential (on any route, served or refused). Logged, never stored as a row.
- `security.forbidden`: the caller was identified but lacked the permission the route needs.
- `security.rate_limit_hit`: a rate-limit budget was spent.
- `security.reauth_required`: a step-up was demanded. The caller held the key but had not proved themselves recently enough. It is recorded so the challenge itself can be shown afterwards.
- `security.token.invalid_signature`: a bearer JWT whose signature or signing key does not verify (forged or guessed).
- `security.token.malformed`: a bearer or cookie value that is not a well-formed token of the expected kind. Expired or revoked sessions are not this; they are `auth.*` or a bare metric.
- `security.api_key.revoked`: an `sk_` key presented with its correct secret after it was revoked.

## Relationships
- `shared/authorization-keys.generated.yaml` is the only graph neighbor. The only link visible in this file is the `security.reauth_required` description, which refers to the caller holding "the key". The file does not otherwise reference it.

## Notes
- It is not read at boot. `npm run regenerate` writes `src/infrastructure/observability/audit-actions.generated.ts` from it, so the strings can type a union (`CoreAuditAction`). A loaded list would widen to `string`.
- Edit this YAML and re-run `npm run regenerate`. Do not edit the generated `.ts` file.
- `security.unauthorized` and `security.token.*` are deliberately split: token actions cover only forged or malformed credentials, while ordinary expired or revoked sessions are excluded.
