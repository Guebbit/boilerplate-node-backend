---
source: src/infrastructure/adapters/antibot-providers/index.ts
sha256: c3800c340a289748d5e2fc22ed010fbfcb6b7ceb1ce95339efa56ffec7ad1fe3
generated_at: 2026-11-08T03:16:55.685161+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/index.ts

## Purpose

Defines the **human-challenge port** (Rung 3 of the anti-automation ladder) and its provider registry. It declares the `HumanChallengeProvider` contract, registers the shipped implementations (`none`, `turnstile`, `altcha`), and exposes a resolver that reads `NODE_ANTIBOT_PROVIDER` at call time to pick the active one. This file is the single place where a deployment selects which challenge implementation answers.

## Key elements

- **`IssuedChallenge` / `ChallengeParameters`** — interfaces describing the shape a self-hosted provider hands the client (parameters + HMAC signature). Structurally identical to `modules/antibot`'s `AntibotChallenge` but declared locally so infrastructure never imports from a module-owned schema.
- **`HumanChallengeProvider`** — the port contract. Requires `name`, `publicParameters(challengeUrl)`, and `verify(token, remoteAddress?)`; optionally `issueChallenge()` for self-hosted providers.
- **`registry`** — a `ProviderRegistry<HumanChallengeProvider>` containing `none`, `turnstile`, and `altcha`. Adding a provider means one adapter file plus one entry here.
- **`resolveHumanChallengeProvider()`** — reads `NODE_ANTIBOT_PROVIDER` (via `antibotConfig()`) and returns the matching provider. Throws on an unknown name; does **not** fall back to `none`.
- **`isHumanChallengeEnabled()`** — convenience check: `resolveHumanChallengeProvider().name !== 'none'`.
- **`humanChallengeProviderProbe`** — a `defineProbe` entry for boot-time validation that the env var names a known provider.

## Relationships

- **`@infrastructure/runtime/provider-registry`** — provides `createProviderRegistry` and `requireProvider`, the generic mechanism behind all rung selections.
- **`@infrastructure/config/define`** — supplies `defineProbe` for the boot-time shape check.
- **`@infrastructure/adapters/config`** — `antibotConfig()` reads the `NODE_ANTIBOT_PROVIDER` env var that drives resolution.
- **`./none`, `./turnstile`, `./altcha`** — the three concrete adapters registered in the registry.
- **`../antibot-verdict`** — contributes the `RungVerdict` type that `verify()` must return.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — consumes `resolveHumanChallengeProvider` / `isHumanChallengeEnabled` to gate requests.
- **`src/modules/antibot/controllers/get-antibot-challenge.ts`** — calls `issueChallenge()` and `publicParameters()` on the resolved provider.
- **`src/modules/antibot/service.ts`** — calls `verify()` on the resolved provider.
- **`src/app/config.ts`** — the top-level config that ultimately surfaces the provider name to `GET /config`.
- **`tests/unit/.../index.test.ts`** — unit tests for the registry, resolver, and probe.
- **`tests/unit/scenarios/no-human-challenge.test.ts`** — scenario test confirming the `none` provider path.

## Notes

- The resolver is **not memoised** (unlike, e.g., the payment provider). Every call re-reads env and re-looks-up the registry; this is intentional and consistent with the other two rungs.
- A typo in `NODE_ANTIBOT_PROVIDER` throws at runtime rather than silently downgrading to `none`. The `humanChallengeProviderProbe` is the boot-time guard for the same failure mode.
- `publicParameters` receives `challengeUrl` as a parameter because the module (`modules/antibot`) owns the route; the provider itself never hardcodes or guesses it.
- `IssuedChallenge` is deliberately **not** imported from `@types` to keep infrastructure independent of a single module's schema. The two shapes agree field-for-field, so the module's controller passes the value through with no cast.
