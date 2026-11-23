---
source: src/modules/account/two-factor/delivered-codes.ts
source_sha256: 8edfa7f6a69c74df8313c0f93f20c978730c19ab25d2442879bd4e6c8283ce49
context_sha256: 4d222ecb84b617b32b2deb0711f0bfe3d1bd0fe06932f0b3973ea0f2c2a97dd7
generated_at: 2026-11-22T04:10:52.773327+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose
Defines the short numeric codes sent by "delivered" two-factor methods (e.g. email): minting, storage form, and the checks that decide whether a code is still usable. It is pure. It reads and writes a method entry but never touches the database, so TTL, attempt and cooldown rules can be tested against a fixed clock.

## Key elements
- `DELIVERED_CODE_TTL_MS`, `DELIVERED_CODE_RESEND_SECONDS`, `DELIVERED_CODE_MAX_ATTEMPTS`: exported constants read from `twoFactorRules.deliveredCodes` (`rules.generated`). The digit count is a private constant from the same source.
- `hashDeliveredCode(code)`: returns the hex HMAC-SHA256 of the code. The key is an HKDF subkey (info `delivered-code`) of the newest key in the TOTP encryption key ring.
- `generateDeliveredCode()`: returns a zero-padded code from `crypto.randomInt` (CSPRNG).
- `deliveryCooldownRemaining(entry, now?)`: seconds until another send is allowed, anchored on `entry.codeSentAt`. Returns 0 when a send may proceed.
- `armDeliveredCode(entry, code, now?)`: mutates the entry with the new `codeHash`, `codeSentAt` and `codeExpiresAt` (now + TTL), and resets `codeAttempts` to 0. Any code already in flight is replaced.
- `DeliveredCodeVerdict`: `'none' | 'expired' | 'match' | 'miss'`.
- `checkDeliveredCode(entry, code, now?)`: compares a typed code with the one in flight and returns a verdict.
  - `none`: no hash or expiry is stored, or attempts have reached the maximum.
  - `expired`: the expiry time has passed.
  - `match` / `miss`: constant-time comparison of the stored hash with the hash of the typed code.

## Relationships
- `session/config` supplies `getTotpEncryptionKeyRing()`. `infrastructure/security/subkey` derives the HMAC key from its newest entry.
- `infrastructure/security/constant-time` provides `constantTimeEqual` for hash comparison.
- `../cooldown` provides the shared `cooldownRemaining`, which this file calls with its own anchor and window.
- `@modules/users` (`index.ts`, `model.ts`) supplies the `DeliveredCodeState` entry type that these functions read and write.
- `delivered-code-verify.ts` does the actual spending of a code and counting of attempts, as conditional writes through the users data layer. This file's check is deliberately read-only.
- `src/modules/account/two-factor/index.ts`, `src/modules/account/two-factor/methods/email.ts`, the services (`reauth`, `two-factor-enrollment`, `two-factor-outcomes`) and `src/modules/account/tests/unit/two-factor.test.ts` are related neighbors in the graph. This file shows no direct interaction with them.

## Notes
- The attempt cap (`DELIVERED_CODE_MAX_ATTEMPTS`), not the hash, is what protects the six-digit space against online guessing. The HMAC only keeps a database dump from yielding codes without the environment key.
- Only the ring's newest key is used. A key rotation while a code is in flight invalidates that code, which is accepted because codes live at most one TTL.
- `checkDeliveredCode` must stay side-effect free. A read-then-write on a loaded copy would let parallel requests both spend one code or both count one guess.
- `now` is injectable on the time-dependent functions for testing.
