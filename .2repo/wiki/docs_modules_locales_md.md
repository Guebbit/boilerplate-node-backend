# docs/modules/locales.md

## Purpose

Documents the dependency-free `locales` module, which owns two things: the set of languages the deployment speaks (Tier 1, file-based dictionaries loaded into i18next at boot) and the runtime override rows (Tier 2, one per `locale · scope · key`) that patch those dictionaries without touching source files. It exists so copy can be edited at runtime while remaining available during full backend outages.

## Key elements

- **`scope` field** — the single discriminator on every override row. `app` → served to the frontend via `GET /locales/:locale/messages` and merged over the bundled copy key-by-key. `api` → layered over Tier 1 in-process at boot, on a timer, and after every admin write; never leaves the service.
- **Tier 1 files** — `src/locales/*.json` plus each module's `locales/` folder. Loaded into i18next at boot; drive `t()` resolution and `Content-Language`. Permanent on disk by design.
- **Tier 2 rows** — one document per `(locale, scope, key)`. Edited by admins at runtime. Overriding only: a row cannot introduce a key the files do not already define.
- **`GET /locales`** — reports `scopes` per language (not a bare tag list), so "can the API answer in this language" and "can I download this dictionary" are answered independently.
- **`GET /locales/:locale/messages`** — the sole HTTP sink for `scope: app` rows; the frontend merges the result over its bundled copy.

## Relationships

- **docs/tools/i18n.md** — describes the i18next mechanism both tiers run on; `locales` is the data layer, `i18n` is the resolution layer.
- **docs/theory/request-input.md** — explains how an incoming request's locale is negotiated; that negotiated locale is the key that Tier 1 and Tier 2 both resolve against.
- **docs/tools/demo-profile.md** — the demo dataset registers specific languages and scopes (e.g. `es` with no backing file) to exercise the distinction between "language present in DB" and "language the API can answer in."
- **docs/modules/index.md** — the overview map that places `locales` as the one module with zero in- or out-degree in the dependency graph.

## Notes

- **No barrel, no imports, no events.** Nothing in the codebase imports `locales` and it imports nothing. Deleting the module removes one folder and this page; no other code or doc page changes.
- **`scope` is load-bearing.** Changing a row's `scope` silently redirects it to the wrong dictionary (`app` vs `api`). This is the most common source of "my edit isn't showing up" reports.
- **Rows patch, they do not create.** A key with no file backing will never render regardless of how many override rows reference it.
- **No request-path awaits.** A Mongo outage or a malformed key degrades to a stale overlay or one failing endpoint; every other response still resolves copy from the files.
- **Demo `es` trap.** The demo intentionally registers `es` in the override table with no `src/locales/es.json`. Any test that asserts "language listed → API responds" will fail by design.
