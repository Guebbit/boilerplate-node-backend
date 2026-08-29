# docs/reference/src-modules.md

## Purpose

Catalogs the **file shapes** (recurring file patterns) shared across all thirteen modules under `src/modules/`, explaining each shape once so readers don't need to re-learn the structure per domain. Serves as the index into the per-module pages and the enforcement test that keeps new shapes visible.

## Key elements

- **Core shape table** — the nine files every module carries (`module.ts`, `routes.ts`, `controllers/`, `service.ts`, `services/`, `repository.ts`, `model.ts`, `openapi.yaml`, `locales/`), each with a one-line description and "read next" links.
- **Optional shape table** — eleven files present only when a domain needs them (`index.ts`, `domain/`, `events.ts`, `audit.ts`, `metrics.ts`, `analytics.ts`, `emails.ts`, `probes.ts`, `demo.ts`, `factory.ts`, `asyncapi.yaml`).
- **One-offs** — three shapes unique to a single module (`session/` in account, `providers/` in payments, `config.ts`).
- **Mermaid flowchart** — visualises the declaration → routes → controllers → service → domain/repository → model pipeline, plus optional side files.
- **Enforcement note** — `tests/cross-cutting/module-file-shapes.test.ts` holds the same catalogue as regex patterns and fails on unrecognised files in a module folder.

## Relationships

- **docs/reference/tests.md** — this page names three cross-cutting tests that enforce its catalogue: `module-file-shapes.test.ts` (unrecognised file shapes), `controller-naming.test.ts` (controller file naming), and `audit-actions.test.ts` (audit action vocabulary). A new shape or audit action must be registered in the corresponding test to avoid invisible drift.

## Notes

- A module with none of the optional-shape files is *not* incomplete; the doc explicitly calls it "small."
- `openapi.yaml` fragments are treated as the source of truth: code is written to match the fragment, never the reverse. The same contract-first stance applies to `asyncapi.yaml`.
- The `index.ts` barrel is the sole public surface of a module; importing past it into internals is a lint error, making that file the effective module boundary.
- Adding a new shape costs exactly one line in `module-file-shapes.test.ts` and one row in this page — the doc warns that skipping either makes the shape "invisible."
