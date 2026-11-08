---
source: scenarios/support/development-doubles.ts
sha256: 94e60bc34760db52e6634266ffc3a937caa58be24925ad2c4f16387f6d69d3c3
generated_at: 2026-11-08T02:33:16.925908+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/development-doubles.ts

## Purpose

A Node preload script (loaded via `tsx --import`) that injects development-only doubles—fake payment provider, log-based mail transport, and a stand-in OAuth provider—into the application's registries. It exists so that local dev, e2e, demo, debug, and `scenario:apply` processes get working infrastructure without any of the fakes living in `src/` or the production Docker image.

## Key elements

- **Module-level side effects** (no named exports): the file *is* the setup sequence.
- **`DEV_DEFAULTS`** — a `Readonly<Record<string, string>>` mapping three env vars (`NODE_PAYMENT_PROVIDER`, `NODE_MAIL_TRANSPORT`, `NODE_PSEUDONYM_KEY`) to fallback values. Only applied when the variable is unset or blank in `process.env`.
- **`refreshEnvironment()`** (from `@infrastructure/config/store`) — re-snapshots `process.env` into the config store *after* the defaults have been written, because the initial `dotenv` import already captured a snapshot without them.
- **`registerDoubles()`** (from `./doubles/register`) — registers the fake payment and mail-log doubles in their respective registries.
- **`registerOAuthProvider('fake', () => fakeOAuthProvider)`** — registers the OAuth stand-in. The second argument is a *factory* (thunk), not a bare value, because the OAuth registry re-evaluates "is it configured?" on every resolution.

## Relationships

- **`src/infrastructure/config/dotenv.ts`** — imported purely for its side effect of loading `.env` into `process.env` before anything else runs.
- **`src/infrastructure/config/store.ts`** — `refreshEnvironment` re-reads `process.env` so the config store reflects the defaults set in this file.
- **`scenarios/support/doubles/register.ts`** — provides `registerDoubles()`, which wires up the fake payment and mail-log providers.
- **`scenarios/support/doubles/oauth-fake.ts`** — provides the `fakeOAuthProvider` object used in the OAuth registry entry.
- **`src/modules/account/oauth/providers/index.ts`** — exposes `registerOAuthProvider`, the registration API this file calls.
- **`scenarios/apply.ts`** — one of the entry-point scripts (`scenario:apply`) that loads this file via `--import`.
- **`docker-compose.yml`** — the production image built here deliberately excludes the doubles; this file is the mechanism that *adds* them back in local/dev contexts.

## Notes

- **No exports.** The module is purely imperative; it is consumed via `--import` side effects.
- **`cluster.fork()` compatibility.** Because `execArgv` propagates to every worker, a clustered process preloads this file in each worker automatically.
- **`NODE_PSEUDONYM_KEY` default is intentionally non-secret.** It is a fixed hex digest that must be stable across runs; the comment explicitly notes nothing here holds sensitive data.
- **Ordering matters.** The `refreshEnvironment()` call must come *after* both the `dotenv` import and the `DEV_DEFAULTS` loop; otherwise the store snapshots env before defaults are applied.
- **The OAuth entry is a factory, not a value.** Swapping `() => fakeOAuthProvider` for the object itself would break the registry's "is it configured?" check on subsequent calls.
