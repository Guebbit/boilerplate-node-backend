# locales

::: tip At a glance
**Owns** — which languages this deployment speaks, and the runtime overrides layered over the bundled copy.
**Depends on** — nothing. It has no barrel either: nothing may import it.
**Breaks if you change** — the `scope` field. It decides which of two dictionaries a row patches.
:::

<!-- gen:identity:start -->

| Fact                     | This module                                                           |
| ------------------------ | --------------------------------------------------------------------- |
| **Subdomain**            | `generic` — A solved problem. Modelling effort here would be waste.   |
| **Base path**            | `/locales`                                                            |
| **Collections**          | `localemessages` (model `LocaleMessage`) · `locales` (model `Locale`) |
| **Depends on**           | _nothing_                                                             |
| **Depended on by**       | _nothing_                                                             |
| **Languages**            | `en` · `it`                                                           |
| **Seeded**               | yes — `locales` as `stored`, `localeMessages` as `stored`             |
| **Frontend counterpart** | `locales` in `boilerplate-vue-frontend`                               |

::: info Stands alone
No module depends on this one and it depends on none. Deleting the folder and its line in `src/modules.ts` costs nothing else.
:::

<!-- gen:identity:end -->

## The map

<!-- gen:map:start -->

`locales` sits on no edge of the context map — nothing imports it and it imports nothing.

<!-- gen:map:end -->

## The story

This is the subtlest module in the repo, and almost all of the subtlety is one distinction.

**There are two tiers, and they never merge.**

_Tier 1 is the API's own copy_ — `src/locales/*.json` plus every module's `locales/` folder, loaded
into i18next at boot. It is what `t()` resolves, what decides `Content-Language`, and it stays on
the filesystem permanently. It exists so a client can render copy _when no response arrives_, and
putting it behind a database would make it unavailable in exactly the outage it was created for.

_Tier 2 is the overrides_ — the two collections this module owns, edited at runtime by people who do
not open a code editor. One row per `(locale, scope, key)`, and `scope` says which dictionary it
patches:

| `scope` | Served by                           | Merged where                                                         |
| ------- | ----------------------------------- | -------------------------------------------------------------------- |
| `app`   | `GET /locales/:locale/messages`     | the frontend, over what it bundles, key by key                       |
| `api`   | nothing — never leaves this service | layered over tier 1 at boot, on a timer, and after every admin write |

::: warning Both halves are overrides, never dictionaries
Neither side may introduce a key its files do not already define and expect it to render. **The
files decide what exists; the rows decide what it says.**
:::

::: warning A language in the database does not mean the API can answer in it
`GET /locales` reports `scopes` per language rather than a bare list of tags, so "may I send
`Accept-Language: es`" and "may I download a Spanish dictionary" stay two questions. The demo
dataset registers `es` with no `src/locales/es.json` behind it precisely so the answers really are
_no_ and _yes_.
:::

Nothing here is awaited on the request path. Mongo down, a language half-translated, a malformed
key — the worst outcome is one endpoint failing and the overlay going stale, while every other
response still resolves its copy from the files.

## Data

<!-- gen:data:start -->

#### `localemessages`

From model `LocaleMessage`. `_id` and `__v` are omitted — every document carries them.

| Field       | Type     | Flags    | Default | Reference / values |
| ----------- | -------- | -------- | ------- | ------------------ |
| `locale`    | `String` | required | —       | —                  |
| `tenant`    | `String` | required | —       | —                  |
| `key`       | `String` | required | —       | —                  |
| `value`     | `String` | —        | ""      | —                  |
| `createdAt` | `Date`   | —        | —       | —                  |
| `updatedAt` | `Date`   | —        | —       | —                  |

**Declared indexes**

| Keys                           | Options                                        |
| ------------------------------ | ---------------------------------------------- |
| `locale: 1, tenant: 1, key: 1` | name: localeMessages_locale_tenant_key, unique |

#### `locales`

From model `Locale`. `_id` and `__v` are omitted — every document carries them.

| Field          | Type      | Flags    | Default | Reference / values |
| -------------- | --------- | -------- | ------- | ------------------ |
| `tag`          | `String`  | required | —       | —                  |
| `baseLanguage` | `String`  | required | —       | —                  |
| `name`         | `String`  | required | —       | —                  |
| `nativeName`   | `String`  | required | —       | —                  |
| `direction`    | `String`  | —        | "ltr"   | `ltr` \| `rtl`     |
| `active`       | `Boolean` | —        | true    | —                  |
| `revision`     | `Number`  | —        | 0       | —                  |
| `createdAt`    | `Date`    | —        | —       | —                  |
| `updatedAt`    | `Date`    | —        | —       | —                  |

**Declared indexes**

| Keys     | Options                   |
| -------- | ------------------------- |
| `tag: 1` | name: locales_tag, unique |

<!-- gen:data:end -->

## Surface

<!-- gen:surface:start -->

| Endpoint                                     | Middlewares                                               | Controller             | What it does                 |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------- | ---------------------------- |
| `GET /locales`                               | `getAuth` → `isAuth` → `isAdmin` → `getAuth` → `(inline)` | `getLocales`           | Supported languages          |
| `POST /locales`                              | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `createLocale`         | Add a language               |
| `DELETE /locales/{locale}`                   | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `deleteLocale`         | Remove a language            |
| `GET /locales/{locale}`                      | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `getLocaleDictionary`  | API message dictionary       |
| `PUT /locales/{locale}`                      | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `updateLocale`         | Edit a language              |
| `GET /locales/{locale}/entries`              | `getAuth` → `isAuth` → `isAdmin`                          | `getLocaleEntries`     | List translation entries     |
| `PATCH /locales/{locale}/entries`            | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `mergeLocaleEntries`   | Merge entries                |
| `POST /locales/{locale}/entries`             | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `createLocaleEntry`    | Add one translation entry    |
| `PUT /locales/{locale}/entries`              | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `replaceLocaleEntries` | Replace every entry          |
| `DELETE /locales/{locale}/entries/{entryId}` | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `deleteLocaleEntry`    | Remove one translation entry |
| `PUT /locales/{locale}/entries/{entryId}`    | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `updateLocaleEntry`    | Edit one translation entry   |
| `GET /locales/{locale}/messages`             | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `getLocaleMessages`    | Client message dictionary    |
| `GET /locales/tenants`                       | `getAuth` → `isAuth` → `isAdmin` → `(inline)`             | `getLocaleTenants`     | Translation tenants          |

Middlewares run left to right; the controller is the last handler on the route. Summaries come from this module’s own `openapi.yaml`, which is where they are edited.

<!-- gen:surface:end -->

## Signals

<!-- gen:signals:start -->

#### Audit actions

| Constant                      | Action name                   |
| ----------------------------- | ----------------------------- |
| `ADMIN_LOCALE_CREATED`        | `admin.locale.created`        |
| `ADMIN_LOCALE_UPDATED`        | `admin.locale.updated`        |
| `ADMIN_LOCALE_DELETED`        | `admin.locale.deleted`        |
| `ADMIN_LOCALE_ENTRY_CREATED`  | `admin.locale_entry.created`  |
| `ADMIN_LOCALE_ENTRY_UPDATED`  | `admin.locale_entry.updated`  |
| `ADMIN_LOCALE_ENTRY_DELETED`  | `admin.locale_entry.deleted`  |
| `ADMIN_LOCALE_ENTRY_IMPORTED` | `admin.locale_entry.imported` |

<!-- gen:signals:end -->

## Files

<!-- gen:files:start -->

| File                                  | What it is                                                                                                                                                   | Explained in                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `audit.ts`                            | Which of this module’s operations reach the audit trail, and under what action names.                                                                        | [read](../tools/winston.md)              |
| `controllers/delete-locale-entry.ts`  | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/delete-locale.ts`        | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/get-locale-entries.ts`   | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/get-locale-messages.ts`  | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/get-locale-tenants.ts`   | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/get-locales.ts`          | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/write-locale-entries.ts` | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `controllers/write-locales.ts`        | One operation: reads inputs, calls the service, answers through the response envelope, and catches.                                                          | [read](../theory/request-flow.md)        |
| `demo.ts`                             | This module's seed fixtures, upserted through the shared seeding primitive.                                                                                  | [read](../tools/demo-profile.md)         |
| `factory.ts`                          | Fixture builders for tests, on top of the shared persistence factory.                                                                                        | [read](../tools/unit-testing.md)         |
| `locales/en.json`                     | This module's user-facing strings, one file per language.                                                                                                    | [read](../tools/i18n.md)                 |
| `locales/it.json`                     | This module's user-facing strings, one file per language.                                                                                                    | [read](../tools/i18n.md)                 |
| `model.ts`                            | The Mongoose schema, its indexes and its serialisation rules — the collection's shape.                                                                       | [read](../tools/mongodb-mongoose.md)     |
| `module.ts`                           | The manifest — the only file the application loads directly. Declares the name, base path, router, dependency edges, locales, seeds and event subscriptions. | [read](../theory/modules.md)             |
| `openapi.yaml`                        | This module's slice of the REST contract. The root `openapi.yaml` is bundled from these.                                                                     | [read](../api/contract-fragmentation.md) |
| `repository.ts`                       | Every query this module makes, on the shared base repository. The only tier that talks to Mongoose.                                                          | [read](../tools/mongodb-mongoose.md)     |
| `routes.ts`                           | The URL surface — one line per endpoint, naming its middlewares, the role it requires and the controller it lands on.                                        | [read](../api/endpoints.md)              |
| `service.ts`                          | The domain decision, and the layer that owns status-code meaning.                                                                                            | [read](../theory/layers.md)              |
| `tenants.ts`                          | The tenant registry — which keyspaces this deployment holds words for, read from the environment and published by the module’s own route.                    | —                                        |
| `tests/contract/api.contract.test.ts` | Contract suite — the responses, against the fragment.                                                                                                        | [read](../tools/contract-testing.md)     |
| `tests/unit/audit.test.ts`            | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/model.test.ts`            | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/repository.test.ts`       | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/service.test.ts`          | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/tenants.fixture.ts`       | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |
| `tests/unit/tenants.test.ts`          | Unit suite — the rules, in isolation.                                                                                                                        | [read](../tools/unit-testing.md)         |

<!-- gen:files:end -->

## Working on it

<!-- gen:working:start -->

| Suite    | Files | Where                                 |
| -------- | ----- | ------------------------------------- |
| Unit     | 6     | `src/modules/locales/tests/unit/`     |
| Contract | 1     | `src/modules/locales/tests/contract/` |

```bash
# every suite this module carries
npm run test:module -- src/modules/locales

# after editing this module’s openapi.yaml
npm run contracts:bundle && npm run lint:openapi:modules

# after editing this module’s seeds
npm run db:seed && npm run check:seed-export
```

<!-- gen:working:end -->

## Deeper in

<!-- gen:subpages:start -->

Nothing in this domain needs a page of its own — the story above is the whole of it.

<!-- gen:subpages:end -->

## Related pages

- [Internationalisation](../tools/i18n.md) — the mechanism both tiers run on
- [Modules overview](./index.md) — the whole context map
- [Demo profile](../tools/demo-profile.md) — the seeded languages and which square of the grid each covers
- [Request Input](../theory/request-input.md) — how a locale is negotiated
