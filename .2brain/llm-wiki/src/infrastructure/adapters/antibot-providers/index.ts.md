---
source: src/infrastructure/adapters/antibot-providers/index.ts
sha256: 2972a178bd8f2cc074e31eb90c61f1b3a0e5e55729a285efc9cc2eb744392610
generated_at: 2026-10-01T12:46:26.363715+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/index.ts

## Purpose

Entry point and contract for "rung 3" of the anti-automation ladder — the human-challenge provider. It defines the `HumanChallengeProvider` interface that every implementation (self-hosted or vendor-hosted) must satisfy, registers the bundled implementations in a provider registry, and exposes the resolution/enabled-check helpers that the rest of the system calls. Which implementation is active is a deployment-time decision (`NODE_ANTIBOT_PROVIDER`), not a code branch.

## Key elements

- **`HumanChallengeProvider`** (interface) — the contract: `name`, `publicParameters(challengeUrl)`, optional `issueChallenge()`, and `verify(token, remoteAddress?)`. Vendor-hosted providers omit `issueChallenge`; self-hosted ones must implement it.
- **`IssuedChallenge`** / **`ChallengeParameters`** (interfaces) — the self-hosted challenge shape and the key-derivation parameters (ALTCHA-style). Deliberately re-declared here rather than imported from `@types` (SK-01).
- **`registry`** — a `createProviderRegistry<HumanChallengeProvider>` pre-populated with `none`, `turnstile`, and `altcha`.
- **`registerHumanChallengeProvider(name, provider)`** — add or override an implementation at runtime (used by tests and by live deployments adding a new provider file).
- **`resolveHumanChallengeProvider()`** — reads `NODE_ANTIBOT_PROVIDER` via `antibotConfig()` and calls `requireProvider`. Throws on an unknown name; never silently falls back to `none`.
- **`isHumanChallengeEnabled()`** — returns `true` when the resolved provider is anything other than `none`.
- **`humanChallengeProviderProbe`** — a `defineConfig` boot probe that calls `resolveHumanChallengeProvider` inside `probe`, so a typo in the env var fails fast at startup.

## Relationships

- **`provider-registry.ts`** — supplies `createProviderRegistry` and `requireProvider`, the generic registry mechanics this file instantiates.
- **`config/define.ts`** — supplies `defineConfig` and `probe`, used to declare the boot-time shape check.
- **`antibot-providers/config.ts`** — supplies `antibotConfig()`, which reads `NODE_ANTIBOT_PROVIDER` from the environment.
- **`none.ts` / `turnstile.ts` / `altcha.ts`** — the three concrete `HumanChallengeProvider` implementations imported and registered here.
- **`antibot-verdict.ts`** — provides the `RungVerdict` type returned by `verify`.
- **`modules/antibot/controllers/get-antibot-config.ts`** — calls `publicParameters` and `name` on the resolved provider.
- **`modules/antibot/controllers/get-antibot-challenge.ts`** — calls `issueChallenge` when present.
- **`http/middlewares/human-challenge.ts`** — calls `resolveHumanChallengeProvider` and then `verify` to gate requests.
- **`tests/unit/infrastructure/adapters/antibot-providers/index.test.ts`** — unit-tests the registry, resolution, and enabled-check logic.
- **`tests/unit/scenarios/no-human-challenge.test.ts`** — scenario test confirming the `none` path end-to-end.

## Notes

- `resolveHumanChallengeProvider` is **not** memoised (unlike `PaymentProvider`); it re-reads the env var on every call. This is intentional and consistent with the other two rungs.
- An unknown provider name **throws** rather than defaulting to `none` — a silent fallback would convert a deployment typo into unnoticed loss of protection.
- `verify` returning a `refused` verdict is a normal answer, not an error; only transport/network failures are expected to throw.
- Adding a new provider to a live project requires one new file and one `registerHumanChallengeProvider` call — no edits to this file.
