---
source: src/modules/antibot/module.ts
sha256: f763758bc8ca6ed022f5dd5dd3088700b36101203f8277dde1aa34f499c9b275
generated_at: 2026-09-23T18:22:42.310811+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/module.ts

## Purpose

Module manifest for the **antibot** module. It registers the module's routes and base path, declares that the module stores no personal data, and — most importantly — contributes a `customCheck` that validates antibot-specific environment variables **at boot**, preventing a runtime outage (e.g. a failed challenge on first guarded request) when a selected provider is missing its secrets or the email-policy selector is unrecognized.

## Key elements

- **`ANTIBOT_PROVIDER_SECRETS`** – Maps each selectable provider name (`altcha`, `turnstile`) to the env-var keys it requires. `none` (the default) intentionally maps to nothing.
- **`missingAntibotProviderSecrets()`** – Returns the list of required env vars the currently selected provider lacks. Used inside `customCheck`.
- **`invalidEmailPolicy()`** – Returns `['NODE_ANTIBOT_EMAIL_POLICY']` when the variable is set but fails the `isEmailPolicy` guard; otherwise returns an empty array.
- **`default` export (`AppModule`)** – The manifest object: `name`, `basePath: '/antibot'`, `routes` (from `./routes`), `personalData: 'none'`, and the `customCheck` that composes the two helpers above with `checkSelector('NODE_ANTIBOT_PROVIDER', resolveHumanChallengeProvider)`.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` type that the default export satisfies.
- **`src/kernel/required-config.ts`** – Supplies `checkSelector`, used to validate `NODE_ANTIBOT_PROVIDER` against `resolveHumanChallengeProvider` at boot.
- **`src/infrastructure/adapters/antibot.ts`** – Supplies `isEmailPolicy`, the predicate used by `invalidEmailPolicy()`.
- **`src/infrastructure/adapters/antibot-providers/index.ts`** – Supplies `resolveHumanChallengeProvider`, the resolver passed to `checkSelector`.
- **`src/modules/antibot/routes.ts`** – Provides the `router` instance registered in the manifest.
- **`src/modules.ts`** – Aggregates this module alongside other `AppModule` manifests for application assembly.
- **`src/modules/antibot/tests/unit/module.test.ts`** – Unit-tests the boot-time validation logic exported here.

## Notes

- The `customCheck` array is **order-insensitive** for the caller (it is consumed as a flat list of missing/invalid variable names), but it composes three independent checks: provider secrets, email-policy validity, and the provider selector itself.
- The module is deliberately stateless (`personalData: 'none'`, no collection). The actual challenge-gating middleware (`humanChallengeGate`) lives in `infrastructure/adapters/antibot-providers` and is consumed directly by `account` and `feedback` — **not** through this module.
- Adding a new provider requires extending both `ANTIBOT_PROVIDER_SECRETS` here and the resolver in `antibot-providers`; the boot check will only catch missing secrets for providers already listed in the map.
