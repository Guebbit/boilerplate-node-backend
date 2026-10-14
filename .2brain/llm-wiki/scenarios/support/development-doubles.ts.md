---
source: scenarios/support/development-doubles.ts
sha256: 94e60bc34760db52e6634266ffc3a937caa58be24925ad2c4f16387f6d69d3c3
generated_at: 2026-10-14T07:03:13.452728+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/development-doubles.ts

## Purpose

A Node preload script (invoked via `tsx --import <this file> …`) that wires development/e2e doubles—fake payment provider, log mail transport, and fake OAuth provider—into the application's registries. It exists so that local dev servers, scenario scripts, and demo commands get working stand-ins without any manual environment setup, while production builds never import it.

## Key elements

- **`DEV_DEFAULTS`** — Record of fallback values for `NODE_PAYMENT_PROVIDER`, `NODE_MAIL_TRANSPORT`, and `NODE_PSEUDONYM_KEY`. Applied only when the corresponding env var is unset or blank (trimmed).
- **Default-assignment loop** — Iterates `DEV_DEFAULTS` and writes missing values into `process.env`.
- **`refreshEnvironment()`** (from `store.ts`) — Re-snapshots `process.env` into the config store so the defaults above are visible to the rest of the application.
- **`registerDoubles()`** (from `doubles/register.ts`) — Registers the non-OAuth doubles (payment, mail) in their respective registries.
- **`registerOAuthProvider('fake', () => fakeOAuthProvider)`** — Registers the fake OAuth provider. Uses a factory (not a bare reference) because the OAuth registry re-evaluates "is it configured" on every call.

## Relationships

- **`scenarios/support/doubles/oauth-fake.ts`** — Exports `fakeOAuthProvider`, the object this file registers as the `'fake'` OAuth provider.
- **`scenarios/support/doubles/register.ts`** — Exports `registerDoubles()`, which this file calls to install the payment and mail doubles.
- **`src/infrastructure/config/dotenv.ts`** — Imported purely for its side effect: populating `process.env` from `.env` before defaults are applied.
- **`src/infrastructure/config/store.ts`** — Provides `refreshEnvironment()`, used to re-snapshot the now-complete `process.env`.
- **`src/modules/account/oauth/providers/index.ts`** — Provides `registerOAuthProvider`, the registry entry-point for OAuth providers.
- **`scenarios/apply.ts`** — One of the entry scripts (`scenario:apply`) that runs with this file preloaded.

## Notes

- **No exports.** The module is consumed solely for its side effects; the `@module` JSDoc tag confirms intent.
- **Factory vs. value for OAuth.** The registry's contract is to re-ask the factory on each resolution, so passing a bare object would not satisfy the "is it configured" check. The other doubles go through `registerDoubles()` which handles their own lifecycle.
- **`NODE_PSEUDONYM_KEY` is intentionally non-secret.** The comment states it holds no sensitive data; the hex value only needs to be stable across two runs so digests are comparable.
- **`cluster.fork()` propagation.** Workers inherit `execArgv`, so every forked worker also preloads this file—no per-worker registration needed.
- **Import order matters.** `dotenv` must be imported before `refreshEnvironment()` is called, and the default-assignment loop must run before that snapshot, or the store will see the pre-default environment.
