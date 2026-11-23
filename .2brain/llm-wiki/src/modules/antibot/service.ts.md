---
source: src/modules/antibot/service.ts
source_sha256: c7fe34220ebf2976def01596abd34dd5ccfc4b318b361129f5f1fd71a285f946
context_sha256: 1f6f6c756ab1b63362125c0d468de428b4d59e625095a0dd8f7ff380f879ede3
generated_at: 2026-11-22T04:19:54.311586+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/antibot/service.ts

## Purpose
Supplies the antibot module's contribution to `GET /config`. It reports which human-challenge provider is active, the public parameters a client needs to render that provider's widget, and a summary of the other protection "rungs" (identity budgets and email policy).

## Key elements
- `antibotService.config()`: returns `Promise<AntibotConfig>`. It resolves the active provider with `resolveHumanChallengeProvider()` and returns:
  - `provider`: the provider's `name`.
  - `parameters`: `provider.publicParameters(CHALLENGE_URL)`.
  - `rungs`: `{ identityBudgets: true, emailPolicy: resolveEmailPolicy() }`.
- `CHALLENGE_URL` (`'/antibot/challenge'`): module-private constant passed to the provider so self-hosted providers can point their widget at this module's challenge route.

## Relationships
- `@infrastructure/adapters/antibot-providers` (`index.ts`): supplies `resolveHumanChallengeProvider`, which yields the provider object with `name` and `publicParameters`.
- `@infrastructure/adapters/antibot`: supplies `resolveEmailPolicy`.
- `@types` (`src/types/index.ts`): supplies the `AntibotConfig` return type.
- `src/app/config-routes.ts`: the `GET /config` aggregation that calls this service. It is the "caller" that turns rejections into server errors.
- `src/modules/antibot/index.ts`: the module's entry point, which presumably exposes `antibotService`.
- `src/modules/antibot/tests/unit/service.test.ts`: unit tests for this service.

## Notes
- `config` rejects if `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` names something this build does not include. The caller answers that rejection as a server error.
- The default `none` provider returns an empty parameter map, which means the client should render nothing.
- `CHALLENGE_URL` lives in the module, not the adapter, because an adapter must not know its own mount path. It must stay in sync with `module.ts`'s `basePath` plus `routes.ts`'s `/challenge`.
- `Promise.resolve().then(...)` wraps the synchronous resolvers, so a throw from `resolveHumanChallengeProvider` becomes a rejected promise rather than a synchronous exception. `resolveEmailPolicy()` is called inside the `.then` callback, so it is covered the same way.
- `identityBudgets: true` is hardcoded and not read from configuration.
