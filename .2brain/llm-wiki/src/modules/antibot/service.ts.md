---
source: src/modules/antibot/service.ts
sha256: c7fe34220ebf2976def01596abd34dd5ccfc4b318b361129f5f1fd71a285f946
generated_at: 2026-11-08T05:00:51.055989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/service.ts

## Purpose

Provides the antibot module's slice of the `GET /config` endpoint: which human-challenge provider is active, the parameters the client needs to render its widget, and a summary of the other antibot rungs (identity budgets, email policy).

## Key elements

- **`CHALLENGE_URL`** (`const`) — Fixed path `'/antibot/challenge'` handed to self-hosted providers as their widget mount point. Defined here (in the module) rather than in the provider adapter, by design.
- **`antibotService`** (exported object) — Single method:
  - `config(): Promise<AntibotConfig>` — Resolves the active provider, then returns `{ provider: name, parameters: provider.publicParameters(CHALLENGE_URL), rungs: { identityBudgets: true, emailPolicy } }`. Rejects if `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` names an implementation absent from this build.

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`** — Source of `resolveHumanChallengeProvider`, called inside `config()`.
- **`src/infrastructure/adapters/antibot.ts`** — Source of `resolveEmailPolicy`, used to populate `rungs.emailPolicy`.
- **`src/types/index.ts`** — Provides the `AntibotConfig` return-type used by `config()`.
- **`src/app/config-routes.ts`** — Upstream caller that invokes `antibotService.config()` and maps its rejection to a server-error response.
- **`src/modules/antibot/index.ts`** — Module barrel; re-exports `antibotService` as the module's public surface.
- **`src/modules/antibot/tests/unit/service.test.ts`** — Unit tests for `antibotService.config`.

## Notes

- `CHALLENGE_URL` is intentionally owned by the module, not the adapter: *"an adapter must not know its own mount path."*
- `rungs.identityBudgets` is hardcoded to `true`; it is not derived from any config flag.
- `config()` is always async (returns a Promise) even though the current code path is synchronous — keeps the interface stable if a provider's resolution becomes genuinely async.
- The `none` provider (default) returns an empty parameter map, which the client interprets as "render nothing."
