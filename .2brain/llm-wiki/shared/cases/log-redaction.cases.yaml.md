---
source: shared/cases/log-redaction.cases.yaml
generated_at: 2026-11-22T02:21:28.237623+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/cases/log-redaction.cases.yaml

## Purpose
A shared, language-neutral test-case table that pins what a log line hides. The header says it is run by BEnode and by the PHP twin against their own loggers, so both backends redact identically. Every `redact` case is paired with a `keep` case that bounds it (to prevent over-redaction).

## Key elements
The file has a single top-level `cases:` list. Each entry has `name`, `kind`, and `expect`, plus `key` or `input` depending on kind.

- **kind `key`** (`key`, `expect: redact|keep`): whether the value under a log field or header name is replaced or left alone.
  - Redacted: `password`, `newPassword`, `x-api-key`, `Antibot-Challenge-Token`, the `__Host-device`, `__Host-oauth_state` and `__Host-oauth_deletion_challenge` cookies, `webhookSecret`, `x-hub-signature`, the bare `key`, and `email` (pseudonymised).
  - Kept: `idempotencyKey`, `statusCode`, `code`, `linkCount`, `to`.
- **kind `message`** (`input` → `expect`): address-shaped text in a free-text message becomes a pseudonym. `{hash:X}` in `expect` stands for the keyed digest of X, the same digest the `email` field gets.
  - Covered: emails (plus tags, Unicode local parts and domains, subdomains, trailing full stop, several per line, uppercase lowercased before hashing); IPv4 (port kept outside the hash); IPv6 (compressed, full, loopback, IPv4-mapped, uppercase lowercased).
  - Left alone: `@types/node`, a retina image suffix (`@2x.png`), clock times, ObjectIds, `999.1.1.1`, `1.2.3.4.5`, `Cache::get`, an existing `hmac:…` digest, and messages with nothing to hide.
- **kind `traceUrl`** (`input` → `expect`): a request target as a span would record it.
  - A listed secret parameter's value becomes `REDACTED` (for example `email`, and the OAuth `code` and `state`).
  - An email or IP in any other parameter's value becomes `{hash:X}`.
  - A query with no secret is unchanged.

## Relationships
- `shared/cases/crypto.cases.yaml` is a sibling case file in the same directory. Both are shared case tables, but nothing in this file's content references it directly.

## Notes
- The mask itself is code in each backend. These rows only pin its behavior.
- `X` in `{hash:X}` is the address as hashed: lowercased, without the port. That is why `203.0.113.7:443` yields `{hash:203.0.113.7}:443`.
- The `traceUrl` marker is `REDACTED` without brackets, matching the OTel `url.query` convention.
- In `traceUrl`, the percent-encoded `ada%40example.com` is handled whatever its encoding. The `Ada%40Example.com` case shows it is decoded and lowercased before hashing.
- Several `keep` cases guard against substring over-matching: `idempotencyKey` vs the bare `key`, and `linkCount` vs `linkurl`.
