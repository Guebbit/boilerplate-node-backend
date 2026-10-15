---
source: src/modules/products/services/validation.ts
sha256: e9fdd1c5a39c477fa3205c09a55c107a8eb2e153fb1d06602232ef5c5e795bd2
generated_at: 2026-10-15T11:46:14.037388+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/services/validation.ts

## Purpose

Input-sanitization helpers for the products module. Provides a shared utility that normalizes string-array fields (categories, tags, etc.) before they are processed or persisted by the CRUD service.

## Key elements

- **`sanitizeStringArray`** *(exported const)* — Accepts `string[] | null | undefined`. Trims every element, drops empty/whitespace-only entries, and de-duplicates. Returns a fresh empty array for any non-array input.

## Relationships

- **`src/modules/products/services/crud.ts`** — The CRUD service calls `sanitizeStringArray` to normalize array-valued product fields before further processing or writes.

## Notes

- Non-mutating: always returns a new array; the input array is never modified.
- Dedup preserves first-occurrence order (`Set` insertion order), so the original relative order of surviving elements is maintained.
- A whitespace-only string (e.g. `"  "`) is silently dropped: `.trim()` → `""` → falsy → filtered out.
