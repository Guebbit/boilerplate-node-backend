---
source: src/modules/locales/tests/unit/apps.test.ts
source_sha256: d47a4f01fd4df2392804a60b731184aeea587904ff674616c13227878a8f1036
context_sha256: 7ba936df4d5e49e17e287d5ae92963ee5651179683c679cb556b4cd7cbbce98c
generated_at: 2026-11-22T05:51:26.014595+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/tests/unit/apps.test.ts

## Purpose
Unit tests for the locale app registry in `src/modules/locales/apps.ts`. They check that configuration is read back from environment variables, with the demo backend/frontend pair as the default. The registry readers are lazy, so each case sets the environment and then reads.

## Key elements
- `KEYS`: the three environment variables that name the locale apps: `NODE_LOCALE_APP_BACKEND`, `NODE_LOCALE_APP_FRONTEND` and `NODE_LOCALE_APPS_EXTRA`.
- `withoutEnvironmentInThisFile(KEYS)`: called once at file level. The module comment says `afterEach` restores what the suite started with, so a leaked `NODE_LOCALE_APPS_EXTRA` can't make an unrelated contract test accept an app nobody configured.
- `describe('the app registry')` with four cases:
  - **Defaults**: `listApps()` returns `demo-be` (label `API`, backend) then `demo-fe` (label `Frontend`, frontend). `backendApp()` returns `'demo-be'` and `frontendApp()` returns `'demo-fe'`.
  - **Environment ids**: `NODE_LOCALE_APP_BACKEND=shop-api` and `NODE_LOCALE_APP_FRONTEND=shop-web` make `listApps()` ids `['shop-api', 'shop-web']`.
  - **Extra frontends**: `NODE_LOCALE_APPS_EXTRA` is a comma-separated list. Entries are trimmed and empty entries are skipped. `id=Label` sets a label, and a bare id uses itself as the label. An entry that duplicates an existing id (`demo-fe=Again`) is dropped. The result is the demo pair followed by `mobile` (`Mobile app`) and `kiosk`.
  - **Classification**: with `mobile` added, `frontendAppIds()` is `['demo-fe', 'mobile']`. `isFrontendApp` is true for `mobile` and false for `demo-be`. `isKnownApp` is true for `demo-be` and false for `nobody`.

## Relationships
- Imports `backendApp`, `frontendApp`, `frontendAppIds`, `isFrontendApp`, `isKnownApp` and `listApps` from `src/modules/locales/apps.ts`, the module under test.
- Imports `setEnvironment` and `withoutEnvironmentInThisFile` from `@tests/environment`, which resolves to `tests/support/environment.ts`. It uses them to set the variables for a case and to clear and restore them around cases.

## Notes
- Extra apps are always frontends, in the order given. The backend is always listed first.
- Each case relies on the lazy readers: nothing is cached between a `setEnvironment` call and the next read.
