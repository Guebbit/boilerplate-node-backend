---
source: src/infrastructure/adapters/antibot-providers/index.ts
sha256: c14f68a45e2b36378ab2ad28317dcf0be4f4076aaadc9ed60ecd2b846e652d50
generated_at: 2026-10-14T07:41:18.221954+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/index.ts

## Purpose

Defines the **human-challenge port** (rung 3 of the anti-automation ladder): the interface a deployment must satisfy to answer "is this a real person?" It also owns the provider registry and the resolver that maps the `NODE_ANTIBOT_PROVIDER` env var to a concrete implementation. Ship `none` by default; a live project registers a real provider (Turnstile, Altcha, or a custom one) via `registerHumanChallengeProvider` without editing this file.

## Key elements

- **`HumanChallengeProvider` (interface)** — the port contract: `name`, `publicParameters(challengeUrl)`, optional `issueChallenge()`, `verify(token, remoteAddress?) → RungVerdict`.
- **`IssuedChallenge` / `ChallengeParameters` (interfaces)** — the shape of a self-hosted challenge handed to the client verbatim (parameters + HMAC signature). Declared here to keep infrastructure free of `@types` imports; structurally identical to the module's `AntibotChallenge`.
- **`registry`** (module-private) — a `createProviderRegistry<HumanChallengeProvider>` pre-seeded with `none`, `turnstile`, `altcha`.
- **`registerHumanChallengeProvider(name, provider)`** — add or override a provider at runtime (used by live deployments and tests).
- **`resolveHumanChallengeProvider()`** — reads `NODE_ANTIBOT_PROVIDER` via `antibotConfig()` and `requireProvider`; **throws** on an unknown name rather than silently falling back to `none`.
- **`isHumanChallengeEnabled()`** — convenience boolean: provider name ≠ `'none'`.
- **`humanChallengeProviderProbe`** — `defineConfig` boot probe that calls `resolveHumanChallengeProvider` inside `probe`, so a typo in the env var fails at boot, not in production.

## Relationships

- **`./none.ts`, `./turnstile.ts`, `./altcha.ts`** — concrete implementations registered at module load time.
- **`../antibot-verdict.ts`** — source of the `RungVerdict` type returned by `verify`.
- **`../antibot-providers/config.ts`** — supplies the `antibotConfig()` env slice (notably `NODE_ANTIBOT_PROVIDER`).
- **`@infrastructure/runtime/provider-registry`** — provides `createProviderRegistry` / `requireProvider` used by the registry and resolver.
- **`@infrastructure/config/define`** — provides `defineConfig` / `probe` for the boot probe.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — consumes `isHumanChallengeEnabled` and `resolveHumanChallengeProvider` to gate or run the challenge on each request.
- **`src/modules/antibot/controllers/get-antibot-challenge.ts`** — calls `issueChallenge()` and `publicParameters()` to serve a challenge to the client.
- **`src/modules/antibot/controllers/get-antibot-config.ts`** — exposes `name` and `publicParameters` so the frontend knows which widget to render.
- **`tests/unit/…/index.test.ts`** — unit-tests registry resolution, the enabled check, and the probe.
- **`tests/unit/scenarios/no-human-challenge.test.ts`** — scenario test confirming the `none` path short-circuits.

## Notes

- `resolveHumanChallengeProvider` reads the env **fresh on every call** (no memoisation). This mirrors the other rungs and keeps the cost negligible versus the branch a cache would need.
- A typo in `NODE_ANTIBOT_PROVIDER` **throws** rather than falling back to `none`. The rationale: a silent fallback would silently disable protection, the same failure mode as `NODE_ANTIBOT_EMAIL_POLICY`.
- `issueChallenge` is **optional**. Vendor-hosted providers (Turnstile, Cloudflare) omit it because their widget fetches the challenge from the vendor, not from this server.
- `publicParameters` receives `challengeUrl` explicitly so a self-hosted provider knows which route its widget should hit; the provider never guesses the URL.
- The interface doc block spells out that a real `verify` must call the vendor's endpoint over the network, send the secret from the environment, and treat a network failure as `refused` — not as a pass and not as a local decode.
