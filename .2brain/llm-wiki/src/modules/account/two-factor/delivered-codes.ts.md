---
source: src/modules/account/two-factor/delivered-codes.ts
sha256: 91de3cb9f0293c1976f3260fa2b8cd41a1ff2e6c76f808ee45ab07a3777f14c0
generated_at: 2026-09-23T18:18:19.005772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/two-factor/delivered-codes.ts

## Purpose

Pure helper module for the short 6-digit codes a delivered two-factor method (e.g. email) issues to a user. It mints codes, stores their HMAC digest on a `TwoFactorMethodRecord`, and enforces TTL, attempt, and resend-cooldown rules. It never touches the database — it reads and mutates the in-memory method entry, so the service layer that calls it remains responsible for persistence.

## Key elements

- **`DELIVERED_CODE_TTL_MS`** (600 000) – lifetime of a code in milliseconds (10 min).
- **`DELIVERED_CODE_RESEND_SECONDS`** (30) – minimum seconds between two deliveries of the same method.
- **`DELIVERED_CODE_MAX_ATTEMPTS`** (5) – wrong guesses tolerated before the code is burned.
- **`hashDeliveredCode(code)`** – HMAC-SHA256 of the code using the newest key from the TOTP key ring; produces the hex digest stored in `entry.codeHash`.
- **`generateDeliveredCode()`** – CSPRNG (`crypto.randomInt`) 6-digit zero-padded string.
- **`deliveryCooldownRemaining(entry, now?)`** – delegates to the shared `cooldownRemaining` helper using `entry.codeSentAt` and the 30-second window.
- **`armDeliveredCode(entry, code, now?)`** – stamps a fresh code onto the entry (hash, timestamp, expiry, attempt counter reset).
- **`clearDeliveredCode(entry)`** – nulls all four code-related fields on the entry.
- **`consumeDeliveredCode(entry, code, now?)`** – constant-time comparison of the typed code against the stored digest; on match clears the code and returns `true`; on miss increments attempts and clears the code at the ceiling. Mutates `entry` in place; caller persists.

## Relationships

- **`src/modules/users/index.ts` / `model.ts`** – supplies the `TwoFactorMethodRecord` type that every function reads and mutates.
- **`src/modules/account/session/config.ts`** – provides `getTotpEncryptionKeyRing`, from which the `[0]` (newest) key is used as the HMAC secret.
- **`src/modules/account/cooldown.ts`** – provides the generic `cooldownRemaining` helper that `deliveryCooldownRemaining` wraps with the method-specific window.
- **`src/modules/account/two-factor/methods/email.ts`** – concrete delivered method that generates, arms, and consumes codes via this module's API.
- **`src/modules/account/services/two-factor.ts`** – service layer that loads the method record, calls the pure functions here, then persists the mutated entry.
- **`src/modules/account/two-factor/index.ts`** – barrel that re-exports this module alongside other two-factor utilities.
- **`src/modules/account/tests/unit/two-factor.test.ts`** – unit tests that exercise TTL, attempt, and cooldown logic against an injected clock.

## Notes

- **Caller persists.** Every mutating function (`armDeliveredCode`, `clearDeliveredCode`, `consumeDeliveredCode`) only writes to the passed-in object. Forgetting to save the entry means the state is lost.
- **Single key, no rotation fallback.** `hashDeliveredCode` always uses `keyRing[0]`. Because a code lives at most 10 minutes, there is no scenario requiring decryption under an older ring entry. A key rotation mid-window simply invalidates the in-flight code.
- **Length guard before `timingSafeEqual`.** `timingSafeEqual` throws on unequal-length buffers; the explicit `.length` check makes the invariant visible and prevents a crash if a future change produces differently-sized digests.
- **Cooldown reset on burn.** When max attempts is hit, `clearDeliveredCode` also nulls `codeSentAt`, removing the 30-second resend anchor. The actual rate limit on how many replacements a single challenge may buy is enforced externally by `mfaSendLimiter`, not here.
- **One-use semantics.** A successful verification and a failed-at-ceiling both call `clearDeliveredCode`; a code is never reusable.
