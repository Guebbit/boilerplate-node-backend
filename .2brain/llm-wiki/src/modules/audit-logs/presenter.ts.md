---
source: src/modules/audit-logs/presenter.ts
sha256: caba403552d725ff28e1d9b4f2b4e164d50de97415eba69db87f3924663fc45f
generated_at: 2026-10-29T03:17:40.509693+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/presenter.ts

## Purpose

Transforms a stored audit-log entry into the **platform operator's** view by replacing the raw IP address with a pseudonymised correlation digest. The tenant view serves the entry as stored; this file exists solely to produce the one-field operator variant so the operator can correlate repeated attempts without seeing end-user IPs.

## Key elements

- **`presentIncidentEntry(item: AuditEntryItem): AuditEntryItem`** — The only export. Spreads the input entry and, if `ip` is present, overwrites it with `correlationDigest(item.ip)`. If `ip` is `undefined`, the entry is returned unchanged.

## Relationships

- **`src/types/index.ts`** — Imports the `AuditEntryItem` type that shapes both the input and return value.
- **`src/infrastructure/security/pseudonymise.ts`** — Imports `correlationDigest`, the function that turns an IP into a reversible-by-structure-only digest string.
- **`src/modules/audit-logs/service.ts`** — Consumer of `presentIncidentEntry`; the service calls this presenter when assembling the operator-facing response, as opposed to returning the raw stored entry for the tenant view.

## Notes

- The transformation is **conditional**: entries lacking an `ip` field (e.g., non-incident logs) pass through untouched — no digest is computed.
- The function is a pure, spread-based copy; it never mutates the input object.
- The module doc comment explicitly scopes this file to the *operator* view. Do not use it in the tenant path.
