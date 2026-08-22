# Changelog

All notable changes to this API's contract are recorded here. The contract is `openapi.yaml`;
a breaking change is one a generated client cannot absorb without being regenerated.

## Unreleased

### Breaking — translation `scope` becomes `tenant`

The two-value `LocaleScope` enum (`app` | `api`) could hold exactly one frontend and one backend.
A **tenant** is the same idea with a name instead of a side: one keyspace, authored by one team,
identified by an id the deployment configures. The demo pair is `demo-fe` (the paired frontend)
and `demo-be` (this API's own copy).

- `LocaleEntry.scope`, `CreateLocaleEntryRequest.scope`, `ReplaceLocaleEntriesRequest.scope` and
  `MergeLocaleEntriesRequest.scope` are now `tenant`, a `LocaleTenant` string.
- `LocaleCapability.scopes` is now `tenants: LocaleTenant[]`.
- `GET /locales/{locale}/entries?scope=` is now `?tenant=`.
- `GET /locales/{locale}/messages` accepts `?tenant=` to name which frontend's dictionary to
  build; omitted, the deployment's default frontend tenant. The backend tenant answers 404 here.
- New `GET /locales/tenants` lists the configured tenants (`id`, `label`, `kind`).
- A write naming a tenant the deployment does not know is refused with `422`.
- Configuration: `NODE_LOCALE_TENANT_BACKEND`, `NODE_LOCALE_TENANT_FRONTEND`,
  `NODE_LOCALE_TENANTS_EXTRA` (see `.env-example`).
- Migration `20260822120000-locale-entry-tenant.js` renames the column and maps `app` → `demo-fe`,
  `api` → `demo-be`.

`source` (`static` | `dynamic` | `both`) is unchanged: it still says whether a language comes from
deployed files, the database, or both — a different question from whose words a row holds.
