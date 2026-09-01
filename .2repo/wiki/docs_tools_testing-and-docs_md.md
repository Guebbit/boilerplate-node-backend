# docs/tools/testing-and-docs.md

## Purpose

Central map and navigation hub for all testing layers in the repo. It defines the boundaries between each layer (unit, integration, contract, property, concurrency, fuzzing, mutation), links to each layer's detail page, explains how to read test reports, and documents the single-source-of-truth strategy for demo/test data.

## Key elements

- **Layer table** — maps each testing layer to its question, tool, npm command, and detail-page link (e.g. `npm run test:unit`, `npm run test:contract`, `npm run test:fuzz`, `npm run test:mutation`).
- **Mermaid flowchart** — visual dependency graph showing how layers build on each other (Unit → Integration → Concurrency / Contract → Fuzz; Mutation mutates Unit; LiveFE consumes ContractResponse).
- **Layer-boundary notes** — prose clarifying what each layer does *not* cover, preventing duplication (e.g. over-serialization is only caught at the Contract–Response Shape layer; Mutation only targets the unit layer).
- **Reading a run** — documents `npm run test:report` and `scripts/report-test-results.ts`, which reads Jest JSON output and aggregates by module; notes the script is kept identical in the paired frontend repo.
- **Test-data provenance table** — distinguishes `demo-data.json` (fixed, API-shaped), per-module `demo.ts` (source records), per-module `fixtures.ts` (arbitrary throwaway entities), and `tests/support/contract-data.ts` (zod-derived valid/invalid payloads).
- **Data-flow Mermaid diagram** — shows the one-dataset/one-mapper pipeline and the three generators (factories, contract-data, random world).

## Relationships

- **docs/tools/index.md** — parent index; this page is the "testing & docs" section it links to.
- **docs/tools/unit-testing.md, integration-testing.md, contract-testing.md, contract-request-data.md, property-testing.md, concurrency-testing.md, fuzz-testing.md, mutation-testing.md** — child detail pages linked from the layer table; each of them links back here.
- **docs/tools/demo-profile.md** — referenced for the paired-frontend E2E profile that consumes this repo's seeded data.
- **docs/reference/scripts.md** — the npm commands listed here (`test:unit`, `test:contract`, `test:fuzz`, `test:mutation`, `seed:export`, `check:seed-export`, `test:report`) are defined there.
- **README.md** — top-level entry point that typically directs readers to this map for testing questions.
- **docs/tools/package-scripts.md** — documents the full script inventory; this page highlights the test-relevant subset.

## Notes

- This page is intentionally a *map*, not a detail page: it does not repeat the content of the linked child pages, only the boundary definitions and cross-cutting conventions.
- `scripts/report-test-results.ts` must stay byte-identical in the paired frontend repo (Vitest's JSON reporter matches Jest's shape). This is a convention, not enforced by a CI gate.
- The "two mappers over a shared file" anti-pattern was explicitly removed; the current layout is one dataset + one serializer pass (`seed:export`) + three generators. When adding test data, choose the generator that matches the question (fixed vs. arbitrary vs. illegal).
- `demo-data.json` is pinned by `npm run check:seed-export`; committing a stale snapshot fails the gate.
