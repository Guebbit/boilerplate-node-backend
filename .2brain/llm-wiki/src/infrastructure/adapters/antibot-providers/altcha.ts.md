---
source: src/infrastructure/adapters/antibot-providers/altcha.ts
source_sha256: 5cc03a12d747f9cdc1ba879bdc7688b11d9a7bbb172b5467d46555f374285516
context_sha256: d3e0dfeb85980296a5adc4f12f11a36f6bb2ed7fbd07a9711f40a374a57863d4
generated_at: 2026-11-22T02:33:57.672057+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot-providers/altcha.ts

## Purpose
Self-hosted human-challenge provider using ALTCHA, a proof-of-work challenge that this server both issues and verifies. It is the alternative to `turnstile`: no vendor, no third-party script, no outbound traffic. The proof-of-work cost lands on the visitor's device.

## Key elements
- `altchaProvider` (export): the `HumanChallengeProvider` with `name: 'altcha'`.
  - `publicParameters(challengeUrl)` returns `{ challengeUrl }`. The widget needs no key, and the caller supplies the URL.
  - `issueChallenge` is `issue`.
  - `verify(token)` wraps `check` and turns any rejection into `'refused'`.
- `issue`: calls altcha-lib `createChallenge` with PBKDF2/SHA-256, the `deriveKey` from `altcha-lib/algorithms/pbkdf2`, a 300 s expiry, `cost` from `NODE_ANTIBOT_ALTCHA_COST` and an HMAC signature. It returns `{ parameters, signature }`, with the signature defaulting to `''`.
- `check`: decodes the payload id, refuses if the id is missing or already spent, runs altcha-lib `verify`, and only then `claim`s the id. It resolves to `'ok'` or `'refused'`.
- `signatureSecret`: reads `NODE_ANTIBOT_ALTCHA_SECRET`. It throws if the secret is shorter than `ALTCHA_SECRET_MIN_LENGTH`.
- `payloadId` / `challengeIdOf`: base64 → JSON → challenge id. This is a copy of altcha-lib's private reader.
  - A `server` payload (has `verificationData`) uses `id`.
  - A `client` payload uses `challenge.parameters.data.challengeId`, else `nonce`.
- Constants: `ALGORITHM = 'PBKDF2/SHA-256'` and `TTL_SECONDS = 300`.

## Relationships
- `./index`: supplies the `HumanChallengeProvider` and `IssuedChallenge` types this file implements. The provider is presumably registered there, but this file does not show that.
- `../antibot-verdict`: supplies the `RungVerdict` type (`'ok'` / `'refused'`) returned by `check`.
- `./altcha-store`: `isSpent(id)` is the read-only single-use check and `claim(id)` records the id after successful verification.
- `@infrastructure/adapters/config`: `antibotConfig()` supplies the secret and cost. `ALTCHA_SECRET_MIN_LENGTH` is the minimum secret length.
- `@infrastructure/object-guards`: `isPlainObject` guards the untrusted decoded payload.
- `scripts/contracts/shared-rules-render.ts` and `src/infrastructure/http/validation-messages.ts` are listed as graph neighbors, but no direct interaction is visible in this file.

## Notes
- Single-use is enforced here, not by altcha-lib. No store is passed to `verify`, because the library would record the id before checking the signature. The id is claimed only for a payload that verified.
- A payload with no extractable id is refused, because it cannot be made single-use.
- `signatureSecret()` is deliberately called inside the promise chain. If it ran as an eagerly evaluated argument, its throw would escape synchronously past the `.catch`. As written, a misconfigured deployment refuses callers instead of returning a 500.
- The secret is separate from login secrets, so rotating one does not invalidate the other's in-flight challenges.
- PBKDF2 was chosen over Argon2id for portability. Argon2 is native only on Node 24.7+ and is absent on Bun and Deno.
- The `try/catch` in `payloadId` carries an eslint-disable for `no-restricted-syntax`, since `atob` and `JSON.parse` only signal failure by throwing.
