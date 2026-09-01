# src/infrastructure/runtime/environment.ts

## Purpose

Centralises the two env-var coercions this app needs—integer and boolean—so that every consumer reads `process.env` lazily (at call time, not import time) but agrees on what "valid" means. Exists because the same two coercions were previously written several different ways, and two of the variants silently returned `NaN`.

## Key elements

- **`environmentNumber(key, fallback, min?)`** — Reads `process.env[key]`, validates it is a whole-string base-10 integer (`/^[+-]?\d+$/`), and returns the parsed value. Falls back to `fallback` on missing/empty/malformed input, or when the parsed value is below `min`. Rejects trailing units (`5mb`), hex, and non-integer strings.
- **`environmentFlag(key, fallback)`** — Reads `process.env[key]`, trims and lower-cases, then checks membership in a truthy set (`1, true, yes, on`) or falsy set (`0, false, no, off`). Returns the matching boolean; falls back to `fallback` for anything else (including empty string).
- **`INTEGER`** (module-private) — Strict regex enforcing a complete base-10 integer token.
- **`TRUTHY` / `FALSY`** (module-private) — `Set` objects of accepted on/off spellings, case-insensitive.

## Relationships

All listed graph neighbors are **consumers**: they import `environmentNumber` and/or `environmentFlag` to read their respective configuration variables. The file has no outbound dependencies beyond `process`—it never imports from those neighbors. Because reads are lazy, no consumer's import order or timing constrains when a variable takes effect.

- Adapters (`cache`, `queue`, `storage`, `mailer`, `image`, `demo-outbox`) read connection/size/switch values.
- HTTP middleware (`cache`, `rate-limit`, `rate-limit-store`) read TTL, window, and limit numbers.
- App-level modules (`app.ts`, `security.ts`, `cluster.ts`, `i18n/overrides.ts`, `persistence/search.ts`) read feature flags and tuning numbers.
- `scripts/reap-quarantine.ts` reads thresholds in the same way.

## Notes

- **Lazy by design.** `process.env` is dereferenced inside each function call, not at module-evaluation time. This means a test or a late `dotenv` load can set a variable after imports have resolved and still see it respected.
- **Strict integer, not `Number()`.** `0900` parses to `900` (base-10), not `900` via octal, and `5mb` is rejected outright rather than truncated to `5`.
- **Boolean vocabulary is broader than the legacy splits.** Previously some code used `=== '1'`/`=== 'true'` and others used `!== '0'`, which inverted flags like `NODE_DEMO`. Both vocabularies are now accepted in one place.
- **`min` is a floor, not a clamp.** A value below `min` triggers the *fallback*, not a clamped value—callers can distinguish "unset" from "set too low" by what deployment config looks like.
