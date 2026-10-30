---
source: src/infrastructure/adapters/antibot-providers/index.ts
sha256: 631aec00add7cef48ac59ed4b5733f04877ab9e2f7c265ba7486ae5bec07718f
generated_at: 2026-10-29T01:52:35.581419+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/index.ts

## Purpose

Defines the **human-challenge port** (Rung 3 of the anti-automation ladder) and the provider registry that binds concrete adapters (`none`, `turnstile`, `altcha`) to the `NODE_ANTIBOT_PROVIDER` environment variable. The file exists so that deployment selects an implementation by name at runtime without any code-path branching in the rest of the system.

## Key elements

- **`HumanChallengeProvider`** — the interface every adapter must satisfy: `name`, `publicParameters(challengeUrl)`, optional `issueChallenge()`, and `verify(token, remoteAddress?) → RungVerdict`.
- **`IssuedChallenge`** / **`ChallengeParameters`** — self-contained types for the challenge payload a self-hosted provider hands to the client (structurally mirrors `modules/antibot`'s `AntibotChallenge` schema without importing it).
- **`registry`** — a `createProviderRegistry` instance mapping `none`, `turnstile`, `altcha` to their adapter exports.
- **`resolveHumanChallengeProvider()`** — reads `NODE_ANTIBOT_PROVIDER` from `antibotConfig()` fresh per call; throws on unknown name (no silent fallback to `none`).
- **`isHumanChallengeEnabled()`** — convenience check that the resolved provider is not `none`.
- **`humanChallengeProviderProbe`** — a `defineProbe` boot-time validation slice; calls the resolver at startup to surface typos before traffic arrives.

## Relationships

- **`provider-registry.ts`** — supplies `createProviderRegistry` and `requireProvider`, the generic machinery this index builds on.
- **`config/define.ts`** — supplies `defineProbe`, used to register the boot-time validation probe.
- **`adapters/config.ts`** — supplies `antibotConfig()` which reads `NODE_ANTIBOT_PROVIDER` (and related env vars) from `src/app/config.ts`.
- **`./none.ts`, `./turnstile.ts`, `./altcha.ts`** — concrete adapter exports registered in the local `registry`.
- **`antibot-verdict.ts`** — provides the `RungVerdict` type returned by `verify()`.
- **`modules/antibot/controllers/get-antibot-challenge.ts`** — calls `issueChallenge()` and passes the result to `successResponse<AntibotChallenge>` (no cast needed; shapes agree field-for-field).
- **`modules/antibot/controllers/get-antibot-config.ts`** — reads `publicParameters()` and `name` to build the client-facing config.
- **`http/middlewares/human-challenge.ts`** — calls `isHumanChallengeEnabled()` to gate the middleware and `verify()` to check submitted tokens.
- **`src/app/config.ts`** — upstream source of the env value; the probe registered here is consumed during app boot.

## Notes

- **No memoisation by design.** `resolveHumanChallengeProvider()` re-reads config each call. The JSDoc explicitly contrasts this with `PaymentProvider`'s cached lookup and justifies it by the negligible cost of a registry lookup.
- **No fallback to `none`.** An unrecognised `NODE_ANTIBOT_PROVIDER` value throws. This mirrors the `NODE_ANTIBOT_EMAIL_POLICY` guard: a typo must not silently disable protection.
- **Type independence.** `IssuedChallenge`/`ChallengeParameters` are declared here rather than imported from `@types` so infrastructure never type-checks against a module-owned schema. The module controller passes the value through without a cast.
- **Adding a provider** = one adapter file + one registry entry. No other file in the dependency graph needs modification.
