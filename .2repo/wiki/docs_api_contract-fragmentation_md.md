# docs/api/contract-fragmentation.md

## Purpose

Documents **who owns** the shared API/event contracts, **where** the per-module fragments live, and **how** the eight bundles (OpenAPI, AsyncAPI, AsyncAPI-public, analytics-events, Bruno, Insomnia, Mockoon, Postman) are assembled and delivered to the frontend repo. It is the ownership-and-flow counterpart to the "how to change" workflow page.

## Key elements

- **Eight-bundle table** — lists each bundle, its output path, and its source fragments.
- **Four-verb distinction** — `compiled` (redocly), `merged` (asyncapi), `assembled` (analytics), `generated` (client collections); explains why the difference is structural, not cosmetic.
- **Flow diagram (Mermaid)** — shows fragment → bundle → committed file → manual copy → frontend toolchain.
- **"Why the root file stays whole"** — three load-bearing reasons the bundled file is committed rather than rebuilt on demand (toolchain reads one file, byte-identity test, non-reproducible bundling).
- **Fragment ownership table** — maps every module's `basePath` to its OpenAPI tag(s) and operation count; flags the two non-clean rows (`GET /` health probe, `audit-logs` with no HTTP surface).
- **Fragment contents rule** — a fragment holds only its `paths`, single-use `components.schemas`, and `tags`; shared schemas stay in the root fragment.
- **Practical example** — the `products` module directory tree and its ten operations.
- **npm scripts** — `contracts:bundle`, `check:contracts-bundle`, `gen:asyncapi`.
- **Test gate** — `tests/cross-cutting/contract-bundles.test.ts` asserts every bundle equals its committed file on every run.

## Relationships

- **`asyncapi.yaml`** — the full AsyncAPI bundle this page describes; it is *merged* (not compiled) from per-module fragments plus `shared/contracts/asyncapi.{root,workers}.yaml`, and is marked `shared: false` because the frontend receives `asyncapi.public.yaml` instead.
- **`docs/api/asyncapi-workflow.md`** — companion page covering the *change* workflow for AsyncAPI; this page is explicitly referenced as the ownership/flow reference it links to.
- **`docs/index.md`** — the docs index that lists and links this page.
- **`docs/tools/demo-profile.md`** — documents the demo dataset consumed by the four generated client collections (Bruno, Insomnia, Mockoon, Postman); those collections are built from `openapi.yaml` + that dataset.
- **`package.json`** — defines the scripts this page invokes (`contracts:bundle`, `check:contracts-bundle`, `gen:asyncapi`).

## Notes

- **Byte-identity is the contract between repos.** `scripts/spec-identity.ts` compares this repo's `openapi.yaml` against the frontend's copy and fails the build on any drift. Bundle once, commit, copy — never rebuild on both sides.
- **Comments do not survive bundling.** Redocly parses and strips them; they must live in the module fragments. `contract-bundles.test.ts` asserts the 252 comment lines across sources.
- **Fragment by `basePath`, not by tag.** Tags are a documentation grouping; one module may legitimately use several (e.g., `Auth` + `Account` under `/account`).
- **Duplicated shared schemas are the primary failure mode.** If a schema used by ≥ 2 modules is copied into two fragments, the bundle silently contains two diverging definitions with no tooling to catch it.
- **The four client collections are untracked and generated whole** — there is nothing on disk between spec and collection; a hand-written restatement is a copy that will rot.
- **`asyncapi.public.yaml`** is the subset the frontend actually receives; the full `asyncapi.yaml` is backend-only and intentionally not shared.
