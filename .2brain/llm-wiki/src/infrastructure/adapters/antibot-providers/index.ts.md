---
source: src/infrastructure/adapters/antibot-providers/index.ts
sha256: 1dfd649e14e08e157f672dcbfdba1b7c6e5a24096e6af36b7940a0248e950a22
generated_at: 2026-09-23T17:37:32.901335+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/antibot-providers/index.ts

## Purpose

Defines the `HumanChallengeProvider` port (rung 3 of the anti-automation ladder) and the registry that resolves which concrete implementation a deployment uses via `NODE_ANTIBOT_PROVIDER`. It exists so that adding a new anti-bot vendor is a one-file-plus-one-registry-line change, and so that downstream consumers (middleware, controllers) depend on a single stable interface rather than a specific vendor.

## Key elements

- **`HumanChallengeProvider`** (interface) — the contract every provider must satisfy:
    - `name` — the string `NODE_ANTIBOT_PROVIDER` selects and `GET /antibot/config` publishes.
    - `publicParameters(challengeUrl)` — returns the flat string map the browser needs (site key, script URL, etc.). Self-hosted providers use `challengeUrl`; vendor-hosted ones ignore it.
    - `issueChallenge?()` _(optional)_ — returns a provider-specific challenge for self-hosted providers. Vendor-hosted providers omit this.
    - `verify(token, remoteAddress?)` — validates a client-submitted token and returns a `RungVerdict`. A refusal is a normal return, not a throw; only transport-level failures throw.
- **`PROVIDERS`** (module-local `Record<string, HumanChallengeProvider | undefined>`) — the build-time registry. Currently maps `none`, `turnstile`, and `altcha`.
- **`resolveHumanChallengeProvider()`** — reads `NODE_ANTIBOT_PROVIDER` (via `environmentChoice`) on every call and returns the matching provider. Throws if the name is not in the registry (no silent fallback to `none`).
- **`isHumanChallengeEnabled()`** — convenience check: `true` when the resolved provider is anything other than `none`.

## Relationships

- **`./none.ts`, `./turnstile.ts`, `./altcha.ts`** — concrete `HumanChallengeProvider` implementations registered in `PROVIDERS`.
- **`../antibot-verdict.ts`** — supplies the `RungVerdict` return type used by `verify`.
- **`@infrastructure/runtime/environment`** — `environmentChoice` performs the env-var lookup with allow-list validation inside `resolveHumanChallengeProvider`.
- **`@types`** — supplies the `AntibotChallenge` type used by `issueChallenge`.
- **`src/infrastructure/http/middlewares/human-challenge.ts`** — consumes `resolveHumanChallengeProvider` / `isHumanChallengeEnabled` to gate requests.
- **`src/modules/antibot/controllers/get-antibot-config.ts`** — calls `publicParameters` to build the browser-facing config response.
- **`src/modules/antibot/controllers/get-antibot-challenge.ts`** — calls `issueChallenge` for self-hosted providers.
- **`src/modules/antibot/module.ts`** — owns the route paths passed as `challengeUrl`.
- **`tests/unit/infrastructure/adapters/antibot-providers/index.test.ts`** — unit tests for resolution and the enabled-check.

## Notes

- `PROVIDERS` is deliberately typed `Record<string, … | undefined>` so the `PROVIDERS[name]!` lookup is a real runtime check, not a compile-time no-op. The non-null assertion is safe because `environmentChoice` guarantees the returned key is in the allow-list (i.e., a key of `PROVIDERS`).
- `resolveHumanChallengeProvider` is **not** memoised. This is intentional and matches the pattern used by the ladder's other two rungs; the comment notes that a registry lookup is cheaper than the branch that would cache it.
- A live (vendor-hosted) `verify` implementation must call the vendor over the network with the secret from the environment, never decode the token locally, and map network failures to a `refused` verdict rather than throwing.
- Adding a new provider: create a file in this directory, export an object satisfying `HumanChallengeProvider`, then add one line to the `PROVIDERS` record.
