---
source: scenarios/support/development-doubles.ts
source_sha256: 9168e7b9efedeafb1cf3c0b9cfd83102a060afe48b564c8e5388723d33d6abc5
context_sha256: 9bbe191ba968d610d8e85ff006913a34eaa27f8161291b76c090217c4f1be2a2
generated_at: 2026-11-22T01:47:02.698561+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/support/development-doubles.ts

## Purpose
The single entry point that a development process loads before serving, to get the test doubles (fake payment provider, mail log, fake OAuth provider) that do not exist in production code or the production image. Importing it has side effects: it loads `.env`, fills in developer-machine defaults, and registers the doubles in the registries the application resolves from.

## Key elements
- **Side-effect import of `@infrastructure/config/dotenv`**: placed first so `.env` is in `process.env` before anything else runs.
- **`DEV_DEFAULTS`**: read-only map of defaults for three variables:
  - `NODE_PAYMENT_PROVIDER` = `fake`
  - `NODE_MAIL_TRANSPORT` = `log`
  - `NODE_PSEUDONYM_KEY` = a fixed hex key, not a secret, so digests stay stable between runs.
- **Defaulting loop**: sets each variable only if it is unset or blank (`!process.env[name]?.trim()`), after `.env` has been read.
- **`refreshEnvironment()`**: makes the config store re-snapshot `process.env` so it sees the defaults.
- **`registerDoubles()`**: registers the doubles (from `./doubles/register`).
- **`registerOAuthProvider('fake', () => fakeOAuthProvider)`**: registers the fake OAuth provider through a factory.

The file has no exports; everything happens at import time.

## Relationships
- `@infrastructure/config/dotenv` (`src/infrastructure/config/dotenv.ts`): imported for its `.env` loading side effect.
- `@infrastructure/config/store` (`src/infrastructure/config/store.ts`): provides `refreshEnvironment`, called after the defaults are set.
- `./doubles/register`: provides `registerDoubles`.
- `./doubles/oauth-fake`: provides `fakeOAuthProvider`.
- `@modules/account/oauth/providers` (`src/modules/account/oauth/providers/index.ts`): provides `registerOAuthProvider`, used to add the `'fake'` provider.
- Loaders: `scenarios/apply.ts` (`scenario:apply`) and `scenarios/run-server.ts` are neighbors in the graph; per the header comment, `demo` and `scenario:apply` load this file through a static import.

## Notes
- Order matters: `.env` must be read first so "unset" means unset there too, and `refreshEnvironment()` must follow the defaulting because the config store snapshots `process.env` once.
- The OAuth provider is registered as a factory because the registry re-checks whether a provider is configured on every call; this one always is.
- Per the header comment, with `NODE_ENV=development` a separate boot-time module loads this file; the header is the only source for this.
