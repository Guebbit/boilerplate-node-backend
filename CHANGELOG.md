# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **The REST contract is compiled, not concatenated.** Each module owns one standalone
  `src/modules/<name>/openapi.yaml` — a valid document you can lint on its own
  (`npm run lint:openapi:modules`) or open in a viewer — and `redocly bundle` resolves them against
  `shared/contracts/openapi.root.yaml` into the committed `openapi.yaml`. The custom line-slicing
  bundler and the `openapi/{paths,schemas}.yaml` pairs are gone. The shared YAML anchors became
  named schemas (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), because an anchor cannot
  cross a file boundary — which is precisely why nothing could ever parse a fragment. Verified by
  dereferencing both contracts and deep-comparing: 82 operations before and after, three added
  schemas, nothing else. AsyncAPI and the analytics names still concatenate, for the reason that no
  longer applies here: they carry comments a parse would destroy.

- **The demo dataset is published, not assembled.** `npm run seed:export` seeds a throwaway database
  with the real seeders, reads every row back through the real serializers, and writes
  `db/seeds/dataset.json`; `npm run check:seed-export` asserts the committed copy equals a fresh run.
  Each module states its records in an ordinary `seeds.ts` its own code imports and declares a
  `seedExport` on its manifest. This replaces `db/seeds/seed-identities.ts` and its per-module
  fragments: the two repos shared _facts_ and each wrote its own mapper over them, and the mappers
  are where the drift actually lived — the frontend's mock had hand-written defaults and no `locale`
  at all, with every spec on both sides green.

- **Analytics names are ordinary TypeScript.** `src/modules/<name>/analytics.ts` exports an
  `as const` that its own controllers import and that augments `AnalyticsEventMap`, exactly as
  `audit.ts` augments `AuditActionMap`. `analytics-events.ts` is now an artefact nothing here
  imports — sliced from those modules and checked against their real exported keys, which the old
  text fragments made impossible.

- **`account` is split by what its operations do.** `service.ts` became `services/`
  (authentication, profile, addresses, verification, token-cleanup); the token surface became
  `session/` (config, cookies, jwt) — a folder rather than a published layer, since nothing outside
  the module may import it. The three `addresses-*.ts` files folded into the module's own
  `model.ts`, `repository.ts` and `services/addresses.ts`.

- **Every module's service is reached through one `*Service` namespace.** `delivery`, `inventory`
  and `payments` exported loose functions; the split cost nothing visible and made a spec copied
  from a neighbour fail to run.

- **Models take their field lists from the contract.** `StockMovementDocument` derives from
  `StockMovement` and `MOVEMENT_REASONS` from the generated enum, so a reason added to the contract
  can no longer be rejected by a validator nobody updated. `ProductSnapshot` separates a product's
  stored fields from the document machinery, removing the casts every producer of an embedded order
  line needed.

- `src/types/asyncapi.ts` → `src/types/asyncapi.generated.ts`; `users/validation.ts` folded into
  `users/model.ts`.

### Added

- **`npm run sync:frontend`** — copies every backend-owned shared file into the paired frontend,
  refusing to run on stale sources, and reporting rather than overwriting the files both sides
  maintain by hand.
- **Fixture factories.** `src/modules/<name>/factory.ts` over a shared
  `infrastructure/persistence/factory`, used by the seeders and the tests alike. Fixtures pin their
  own timestamps and seed writes pass `{ timestamps: false }` — which is what makes the exported
  dataset byte-identical across runs, and why `BaseRepository.create` now takes `SaveOptions`.
- **`src/kernel/seed-accounts.ts`** — the two demo accounts' ids and credentials, shared by the four
  modules that need them without buying three registry edges into `users`.
- **Two cross-cutting tests.** `service-namespaces.test.ts` (one namespace per service, holding
  every function that service exports) and `seed-conformance.test.ts` (the dataset still parses as
  the contract says it should — a mirror of the frontend's copy).
- **Per-module contract linting** — `lint:openapi:modules` and `lint:asyncapi:modules`, with their
  own spectral rulesets, both wired into `npm run complete`.
- **`.gitattributes`** marking every generated artefact `linguist-generated`.
- Contract tests for `observability`.

### Removed

- `db/seeds/seed-identities.ts`, the `@seed-identities` path alias, and every `*.fragment.ts` —
  together with the tsconfig, eslint, jest, stryker and prettier exclusions that existed only to
  keep them out of tooling that could not read them.
