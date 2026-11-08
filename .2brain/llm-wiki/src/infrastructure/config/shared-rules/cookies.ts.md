---
source: src/infrastructure/config/shared-rules/cookies.ts
sha256: e0106f127baccacb361f9509d55346035fe32e94db7468c50ab515fb1a0cb68d
generated_at: 2026-11-08T03:25:54.781597+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/shared-rules/cookies.ts

## Purpose

Defines the Zod schema for `shared/rules/cookies.yaml` — a single, shared inventory of every cookie or browser-storage item the app sets (backend, frontend, or third-party library). One schema covers both the backend's and frontend's cookie files, enabling GDPR documentation and log-scrubbing from a single source of truth.

## Key elements

- **`cookieRowSchema`** — `z.strictObject` describing one entry: `name` (wire name), `setter` (`backend | frontend | library`), `kind` (`cookie | localStorage | sessionStorage`), `purpose` (human-readable, printed in the GDPR table), `necessity` (`necessary | preference`), `secret` (excluded from log scrubber), and a mutually-exclusive lifetime via `maxAgeMs` (ms constant) or `lifetime` (`sessionTier | challenge`).
- **`CookieRow`** — TypeScript type inferred from `cookieRowSchema`.
- **`rowId`** — camelCase regex (`/^[a-z][A-Za-z0-9]*$/`); row keys double as frontend translation keys.
- **`cookiesSchema`** — Top-level `z.strictObject({ cookies: z.record(rowId, cookieRowSchema) })` with three refinements: inventory must be non-empty, `maxAgeMs` and `lifetime` are mutually exclusive, and `name` values must be unique across all rows.
- **`CookieRules`** — TypeScript type inferred from `cookiesSchema` (the fully parsed YAML shape).

## Relationships

- **`src/infrastructure/config/shared-rules/registry.ts`** — Registers `cookiesSchema` so the shared-rules loader can parse and validate `cookies.yaml` alongside other rule files.
- **`scripts/docs/generate-cookie-table.ts`** — Consumes the parsed `CookieRules` to emit the GDPR cookie/storage table.
- **`tests/unit/infrastructure/config/cookies-schema.test.ts`** — Unit-tests the schema: valid rows, strictness (extra keys rejected), the three `cookiesSchema` refinements, and `rowId` format enforcement.

## Notes

- All objects use `z.strictObject`; any extra key in the YAML is a hard validation error (treated as a typo or misplaced behavior).
- `maxAgeMs` and `lifetime` are **mutually exclusive** — the refinement rejects a row that sets both.
- The module doc mandates **relative imports only** (see `shared-rules/load.ts` for rationale).
- Row keys are camelCase not for backend convenience but because the frontend reuses them as i18n translation keys.
- The schema intentionally covers `localStorage`/`sessionStorage` alongside cookies so the frontend's separate storage file can use the identical shape.
