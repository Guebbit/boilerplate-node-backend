# docs/reference/src-modules.md

## Purpose

Catalogues every file **shape** that can appear under `src/modules/<domain>/` and maps each shape to the modules that carry it. It exists so a reader can recognise any file in the 13-module tree by its pattern alone, without needing to know the specific domain. It is the single source of truth for "what belongs where" inside a module folder.

## Key elements

- **Core shape table** — the nine files present in every module: `module.ts` (manifest), `routes.ts`, `controllers/`, `service.ts` / `services/`, `repository.ts`, `model.ts`, `openapi.yaml`, `locales/*.json`.
- **Optional shape table** — eleven shapes a module may or may not carry: `index.ts` (barrel), `domain/`, `events.ts`, `audit.ts`, `metrics.ts`, `analytics.ts`, `emails.ts`, `probes.ts`, `demo.ts`, `fixtures.ts`, `asyncapi.yaml`.
- **One-off table** — shapes unique to a single module (e.g. `session/` in `account`), flagged as genuine domain-specific pieces rather than naming drift.
- **Mermaid flowchart** — the layer order from manifest → routes → controllers → service → domain/repo → model, with optional side-car files branching off the manifest.
- **Tip callout** — states that a file matching none of the listed shapes is either a new shape to add here or misplaced; the page is the enforceable catalogue.

## Relationships

- **`docs/theory/layers.md`** — the layer model this page operationalises per-module; "Read next" links point there for `service.ts`, `repository.ts`, `controllers/`.
- **`docs/theory/domain-layer.md`** — explains the `domain/*.ts` shape (pure rules, lint-guaranteed free of Mongoose/Express).
- **`docs/theory/module-lifecycle.md`** — the add/remove lifecycle that the `module.ts` manifest declaration drives.
- **`docs/modules/index.md`** — the per-domain pages that describe *what each domain does* with these shapes; this page is the shape catalogue, those pages are the domain catalogue.
- **`docs/api/endpoints.md`** — the endpoint contract that `routes.ts` lines correspond to.
- **`docs/api/contract-fragmentation.md`** — explains why `openapi.yaml` and `asyncapi.yaml` are per-module fragments bundled into a root document.
- **`docs/api/openapi-workflow.md`** / **`docs/api/asyncapi-workflow.md`** — the authoring workflows for those fragments.
- **`docs/reference/contracts.md`** — `npm run contracts:bundle` (referenced for `analytics.ts` and `openapi.yaml`) is the bundling step documented there.
- **`docs/reference/data.md`** — `demo.ts` seed fixtures and the `db:seed` script interact with the data/reference material.
- **`docs/reference/ops.md`** — `audit.ts`, `metrics.ts`, `analytics.ts` are the per-module hooks into the ops surface described there.
- **`docs/reference/src-app.md`** — `locales/*.json` and the `no-hardcoded-user-text` lint rule are owned at the app level.
- **`docs/reference/tests.md`** — `fixtures.ts` exists so sibling contract suites can build documents; `audit-actions.test.ts` (referenced in the audit row) lives under the test tree.
- **`docs/reference/scripts.md`** — `npm run db:seed` and `npm run contracts:bundle` are the scripts that consume `demo.ts` and the contract fragments respectively.

## Notes

- The page is deliberately a **shape catalogue, not a domain guide**. Domain-specific behaviour is pushed to `docs/modules/<name>/`; mixing the two is the failure mode the tip callout warns against.
- `service.ts` becomes `services/` (a barrel + per-operation files) past ~300 lines; the shape name changes but the tier does not.
- `fixtures.ts` is production code by design—not test scaffolding—because cross-module contract suites import it.
- The file treats any unrecognised file in a module folder as a review question, making the page itself a lightweight invariant (reinforced, per the tip, by a test that cross-checks the tree against the list).
