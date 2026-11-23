---
source: src/infrastructure/adapters/antibot-providers/index.ts
source_sha256: 4d3df4bf45281ffaa0aebbc3822eda2d75910f9fa4e88ad2def7d08188c61f62
context_sha256: beba516a9b044d40f5c9ee726e627ef499b654bb4df1a8c8f42687135a9eb6a9
generated_at: 2026-11-22T02:34:14.411693+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/antibot-providers/index.ts

## Purpose
Defines the human-challenge port (rung 3 of the anti-automation ladder) and selects the concrete implementation at runtime. Which provider answers is a deployment choice via `NODE_ANTIBOT_PROVIDER`; the boilerplate ships `none`, and adding a real provider means one adapter file plus one registry entry here.

## Key elements
- `HumanChallengeProvider` (interface): the contract every provider implements.
  - `name`: the value `NODE_ANTIBOT_PROVIDER` selects, also published as `antibot` on `GET /config`.
  - `publicParameters(challengeUrl)`: browser-visible widget settings as a flat string map (site key, script URL). Self-hosted providers use `challengeUrl`; vendor-hosted ones ignore it.
  - `issueChallenge?()`: optional. Only self-hosted providers implement it. Returns an `IssuedChallenge`.
  - `verify(token, remoteAddress?)`: returns a `RungVerdict`. A refusal is a normal result, and only transport failures throw.
- `IssuedChallenge` and `ChallengeParameters` (interfaces): the self-hosted challenge shape (ALTCHA's parameter set) plus an HMAC `signature`. Fields include `algorithm`, `nonce`, `salt`, `cost`, `keyLength`, `keyPrefix`, and optional `keySignature`, `memoryCost`, `parallelism`, `expiresAt`.
- `registry` (private): built with `createProviderRegistry` and containing `none`, `turnstile` and `altcha`.
- `resolveHumanChallengeProvider()`: returns the provider named by `antibotConfig().NODE_ANTIBOT_PROVIDER` (default `none`) via `requireProvider`. It throws on an unknown name.
- `isHumanChallengeEnabled()`: true when the resolved provider's name is not `none`.
- `humanChallengeProviderProbe`: a boot probe (`defineProbe('antibot-provider', ...)`) that runs the resolver to catch a misconfigured name at startup.

## Relationships
- Registers the adapters `none.ts`, `turnstile.ts` and `altcha.ts` (all in `src/infrastructure/adapters/antibot-providers/`).
- Imports `RungVerdict` from `src/infrastructure/adapters/antibot-verdict.ts` as the return type of `verify`.
- Uses `createProviderRegistry` and `requireProvider` from `src/infrastructure/runtime/provider-registry.ts`.
- Reads `antibotConfig` from `src/infrastructure/adapters/config.ts`.
- Uses `defineProbe` from `src/infrastructure/config/define.ts` for the boot probe.
- Consumed by `src/modules/antibot/service.ts`, `src/modules/antibot/controllers/get-antibot-challenge.ts` and `src/infrastructure/http/middlewares/human-challenge.ts`. The controller passes `IssuedChallenge` straight to `successResponse<AntibotChallenge>`.
- Tested in `tests/unit/infrastructure/adapters/antibot-providers/index.test.ts` and `tests/unit/scenarios/no-human-challenge.test.ts`.

## Notes
- `IssuedChallenge` is deliberately declared here rather than imported from `@types`, so infrastructure doesn't depend on a schema owned by one module. It is structurally identical to the module's `AntibotChallenge`.
- The provider is resolved fresh on every call and not memoised, unlike `PaymentProvider`. The registry lookup is cheap, and the other two rungs also read their env fresh.
- An unknown provider name throws instead of falling back to `none`, because a fallback would silently drop protection after a typo.
- The probe is "shape-less" because the resolver imports the config, so the config can't import the resolver.
- Real providers must verify tokens against the vendor's endpoint (never by decoding them locally), take the secret from the environment, and treat network failure as `refused`, not a pass. `none` never leaves the process, so forgery and replay aren't a concern for it.
