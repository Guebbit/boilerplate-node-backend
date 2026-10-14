---
source: src/modules/account/two-factor/lockout.ts
sha256: 24f53465152e61684c5ab05b39ff2a6d72d7039c43d21cba7c9cb0c3c9ad2831
generated_at: 2026-10-14T14:49:07.001735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/lockout.ts

## Purpose

Declares the two policy constants that govern the 2FA wrong-code lockout: how many failed reservations an account may make before it is locked, and how long that lock persists. The file contains no logic — it is a pure constants module so the values have a single named home.

## Key elements

- **`MFA_MAX_FAILURES`** (`10`) — Maximum number of wrong codes an account may reserve against its armed 2FA before the lock triggers. Documented as a deliberate choice below the NIST SP 800-63B ceiling of 100.
- **`MFA_LOCK_MS`** (`15 * 60_000` → 900 000 ms) — Duration of the lock once `MFA_MAX_FAILURES` is reached (15 minutes).

## Relationships

- **`src/modules/account/two-factor/index.ts`** — The only consumer in the dependency graph. The module-level JSDoc in this file states that the `account` layer owns the policy decision and hands these two values to the `users` module's reservation door on every 2FA attempt; `index.ts` is where that wiring lives.

## Notes

- Both exports are `const` numbers; there is no class, function, or runtime behavior. Importers should treat them as configuration, not as computed values.
- The JSDoc explicitly assigns ownership: `users` stores the per-account failure counter, while `account` (this module's parent) decides the threshold and duration. Don't add mutable state or side-effectful logic here.
- The NIST SP 800-63B reference is a design note, not an import; the file itself does not validate or enforce the limit.
