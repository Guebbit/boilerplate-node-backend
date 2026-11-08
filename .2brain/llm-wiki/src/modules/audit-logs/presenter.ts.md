---
source: src/modules/audit-logs/presenter.ts
sha256: caba403552d725ff28e1d9b4f2b4e164d50de97415eba69db87f3924663fc45f
generated_at: 2026-11-08T05:08:43.232162+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/presenter.ts

## Purpose

Defines the platform-operator presentation layer for audit log entries. The tenant view serves stored entries as-is; this module applies the single transformation that distinguishes the operator view—replacing the raw IP address with a correlation digest so repeated attempts from the same address remain linkable without exposing visitor IPs to the operator.

## Key elements

- **`presentIncidentEntry(item: AuditEntryItem): AuditEntryItem`** — The sole export. Shallow-spreads the stored entry and overwrites `ip` with `correlationDigest(item.ip)`. If `ip` is `undefined`, the entry is returned unchanged (no `ip` key added).

## Relationships

- **`src/types/index.ts`** — Imports the `AuditEntryItem` type, which serves as both input and output shape.
- **`src/infrastructure/security/pseudonymise.ts`** — Imports `correlationDigest`, the one-way hash used to replace the raw IP.
- **`src/modules/audit-logs/service.ts`** — The sibling service in the same module is the expected caller that applies this presenter before returning entries to the operator-facing API.

## Notes

- The spread-conditional pattern (`item.ip === undefined ? {} : { ip: ... }`) intentionally avoids setting `ip: undefined` on the output; the key is simply absent when the source had no IP.
- The module docstring calls this "the operator's view" and contrasts it with the tenant view, but no tenant-view presenter lives in this file—only the operator transformation is defined here.
