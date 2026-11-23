---
source: src/modules/audit-logs/presenter.ts
source_sha256: caba403552d725ff28e1d9b4f2b4e164d50de97415eba69db87f3924663fc45f
context_sha256: cab7a97557b6b9063182d5fa33d7a8e64b4dbf23c8d54eff72120c3485db15d8
generated_at: 2026-11-22T04:27:22.863989+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/presenter.ts

## Purpose
Defines how the platform operator sees an audit entry. The tenant view returns a stored entry as the repository normalised it. The operator view differs in one way: the IP address is replaced by a digest. Repeated attempts from one address still correlate, and the operator never reads a shop visitor's raw IP.

## Key elements
- `presentIncidentEntry(item: AuditEntryItem): AuditEntryItem` is the only export. It returns a shallow copy of the entry. If `item.ip` is defined, the copy's `ip` is `correlationDigest(item.ip)`. All other fields pass through unchanged.

## Relationships
- `src/infrastructure/security/pseudonymise.ts` provides `correlationDigest`, which produces the digest that replaces the IP.
- `src/types/index.ts` provides the `AuditEntryItem` type, imported through the `@types` alias. It is both the input and output type.
- `src/modules/audit-logs/service.ts` is a graph neighbor. This file's content doesn't show how the two interact.

## Notes
- Entries with no `ip` (`undefined`) are returned with no `ip` key added.
- The input is not mutated. The function builds a new object.
- The output keeps the `AuditEntryItem` type, so the `ip` field holds a digest string rather than a real address. Callers can't tell this from the type alone.
