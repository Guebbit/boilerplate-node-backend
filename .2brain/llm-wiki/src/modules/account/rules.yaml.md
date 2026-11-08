---
source: src/modules/account/rules.yaml
sha256: 2af5feb3ee7a583642b823812d0d74f7ef5f300946f13baf6e2c9998366a5ae3
generated_at: 2026-11-08T04:15:48.851069+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/rules.yaml

## Purpose

Single source of truth for the numeric policy constants that govern two-factor authentication (lockout thresholds, delivered-code parameters). It exists so that the TypeScript runtime (via a generated file) and the PHP twin both copy the same plain-data values, keeping the security policy consistent across languages without hand-maintaining duplicated numbers.

## Key elements

- **`twoFactor.lockout.maxFailures`** (10) — maximum wrong codes an account may reserve against its armed 2FA before locking.
- **`twoFactor.lockout.lockMs`** (900000) — lockout duration in milliseconds (15 min).
- **`twoFactor.deliveredCodes.digits`** (6) — length of numeric codes sent via email/SMS.
- **`twoFactor.deliveredCodes.ttlMs`** (600000) — validity window for a delivered code (10 min).
- **`twoFactor.deliveredCodes.resendSeconds`** (30) — minimum cooldown between two deliveries of the same method.
- **`twoFactor.deliveredCodes.maxAttempts`** (5) — wrong guesses a single code tolerates before it is burned.

## Relationships

- **`src/modules/account/openapi.yaml`** — co-defines the 2FA contract within the account module. This file supplies the numeric limits (lockout duration, code TTL, attempt caps) that the API surface documented in the OpenAPI spec enforces (e.g., lockout error responses, code-expiry semantics).

## Notes

- **Not read at boot.** The runtime consumes `rules.generated.ts`, which is produced by `npm run regenerate` from this YAML. Editing this file without running the regenerate step has no effect on runtime behavior.
- **No expressions.** Durations must be written out as literal numbers with the unit encoded in the key name (`…Ms`, `…Seconds`). There is no arithmetic or variable reference.
- **PHP twin.** A parallel PHP implementation copies these same values; both must stay in sync, making this YAML the authoritative reference.
- **Security rationale lives in the comments** (NIST SP 800-63B citation for the 100-miss ceiling; the "five tries out of a million" framing for `maxAttempts`). The comments are the design record, not just decoration.
