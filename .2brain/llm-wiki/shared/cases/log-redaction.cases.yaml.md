---
source: shared/cases/log-redaction.cases.yaml
sha256: da325d19ab9afd1c91791a0a5e8843a7dcc97e835e80f7ba015e5600a5ace324
generated_at: 2026-11-14T17:44:08.222918+00:00
model: ollama:qwen3.8:27b
---

# shared/cases/log-redaction.cases.yaml

## Purpose

Behavioral spec (pinned test cases) for how log output is scrubbed before it leaves the process. Both the BEnode backend and its PHP twin run this file against their own loggers, so the YAML is the single source of truth for redaction rules. Each `redact` case is paired with a `keep` case that defines the boundary.

## Key elements

- **`kind: key`** – Declares whether the *value* under a given key name is replaced or left intact. Covers passwords, API keys, cookies (`__Host-device`, `__Host-oauth_state`, etc.), OAuth tokens, and compound fragments (`webhookSecret`, `x-hub-signature`). Also pins keys that must *not* be eaten (e.g. `idempotencyKey`, `statusCode`, `code`).
- **`kind: message`** – Pins replacement of address-shaped tokens (email, IPv4, IPv6) embedded in free-text log lines. The expected output uses the placeholder `{hash:X}`, where `X` is the canonical form (lowercased, port stripped). Also pins what is *not* an address (npm scopes, `@2x` suffixes, clock times, ObjectIds, version strings, `Class::method`).
- **`kind: traceUrl`** – Pins how a request target recorded in an OTel span is scrubbed. Listed secrets become the literal string `REDACTED` (the OTel `url.query` marker, no brackets). Emails/IPs in *unlisted* parameters become `{hash:X}` digests, same as `message`.
- **`{hash:X}` placeholder** – Represents the keyed digest of `X`; the digest algorithm and key live in the backend, not here. The file only asserts *what* gets hashed and *how* it is canonicalised before hashing.

## Relationships

- **`shared/cases/crypto.cases.yaml`** – The `{hash:X}` placeholder references a keyed digest whose algorithm, key, and canonicalisation rules are specified in the crypto cases file. Log-redaction cases depend on that definition to be deterministic; both files must agree on how `X` is normalised (lowercasing, port stripping) before the digest is computed.

## Notes

- The file is **not** executed directly; it is consumed by test runners in each backend. Changing a `name` or `expect` value changes the contract both backends must honour.
- `{hash:X}` is a *placeholder in expected output*, not a runtime template. The actual digest value differs per environment (key-dependent); tests resolve it via the shared crypto helper.
- `REDACTED` (no brackets) is the OTel `url.query` convention for fully-withheld values; it is distinct from the `{hash:…}` pseudonymisation used for identifiable-but-derivable data.
- Canonicalisation before hashing: lowercased, port stripped. A plus-tag (`+`) and Unicode local/domain parts are preserved as part of the address.
- The boundary cases (`idempotencyKey` ≠ `key`, `linkCount` ≠ `linkurl`, `@types/node` ≠ address, `999.1.1.1` ≠ IPv4) exist to prevent over-matching; adding a new redaction rule requires adding a sibling `keep` case.
