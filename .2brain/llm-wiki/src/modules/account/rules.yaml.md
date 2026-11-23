---
source: src/modules/account/rules.yaml
source_sha256: 2af5feb3ee7a583642b823812d0d74f7ef5f300946f13baf6e2c9998366a5ae3
context_sha256: 270fa87b0a20afb4e1689824dc3a36082794db543f1c91cc06d3bb43497e0566
generated_at: 2026-11-22T03:35:18.694021+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/rules.yaml

## Purpose
Plain-data source of truth for Account's two-factor numbers (lockout policy and delivered-code parameters). It is written as data so a PHP counterpart can copy the same values. It is not read at boot: `npm run regenerate` generates a TypeScript file from it.

## Key elements
- `twoFactor.lockout.maxFailures` (`10`): wrong codes an account may accumulate against its armed 2FA before locking. The comment notes NIST SP 800-63B allows at most 100.
- `twoFactor.lockout.lockMs` (`900000`): lock duration once `maxFailures` is reached (15 minutes).
- `twoFactor.deliveredCodes.digits` (`6`): length of codes sent via delivered methods (email, SMS).
- `twoFactor.deliveredCodes.ttlMs` (`600000`): how long a delivered code is accepted (10 minutes).
- `twoFactor.deliveredCodes.resendSeconds` (`30`): minimum seconds between two deliveries of the same method; the client counts this down.
- `twoFactor.deliveredCodes.maxAttempts` (`5`): wrong guesses a single code tolerates before it is burned. Per the comment, this is what protects six-digit codes, not the hash.

## Relationships
- `src/modules/account/module.ts` is the neighboring module file. Per the file header, this YAML is not read at boot. The content shown does not say how `module.ts` uses these values.

## Notes
- Units are in key names (`Ms`, `Seconds`). Rules files contain no expressions, so durations are written out in full (e.g. `900000`, not `15 * 60 * 1000`).
- Edit this file, then run `npm run regenerate` so the generated output stays in sync; do not hand-edit the generated output.
- The PHP twin copies these numbers, so changes here need to be mirrored there to stay consistent.
