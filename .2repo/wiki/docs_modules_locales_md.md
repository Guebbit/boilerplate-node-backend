# docs/modules/locales.md

## Purpose

Documents the locales module, which defines which languages this deployment supports and how runtime override rows (one per `locale, scope, key`) patch the bundled translation files. It exists so operators can edit copy without touching source code, while the filesystem remains the source of truth for *which* keys exist.

## Key elements

- **Tier 1 (bundled files)** — `src/locales/*.json` plus per-module `locales/` folders; loaded into i18next at boot; resolved by `t()`; permanent on disk.
- **Tier 2 (override rows)** — Two collections keyed by `(locale, scope, key)`. `scope` selects the target dictionary:
  - `scope: "app"` — served via `GET /locales/:locale/messages`, merged key-by-key over the frontend's bundled copy.
  - `scope: "api"` — never leaves this service; layered over Tier 1 at boot, on a timer, and after every admin write.
- **`GET /locales`** — reports `scopes` per language (not a bare tag list), distinguishing "can the API answer in this language" from "can I download a dictionary."
- **`scope` field** — the single discriminator that routes a row to the correct dictionary.

## Relationships

- **`docs/modules/index.md`** — The modules overview page that positions this module in the broader service map; this file cross-references it as the "whole context map."

## Notes

- **No barrel, no imports.** This module must not be imported by other modules. It is a leaf in the dependency graph.
- **Overrides, not dictionaries.** A row can only *change* the text of a key that already exists in the files. It cannot introduce a new key.
- **Language ≠ availability.** A language registered in the database (e.g. `es` in the demo profile) does not guarantee `src/locales/es.json` exists. `GET /locales` encodes this by reporting `scopes` rather than a flat tag list.
- **Nothing is awaited on the request path.** If Mongo is down, a language is half-translated, or a key is malformed, the worst case is one endpoint failing or a stale overlay. All other responses still resolve copy from the filesystem.
- **Changing `scope` breaks routing.** It is the sole field that decides which of the two dictionaries a row patches; swapping values silently re-targets every affected row.
