# docs/theory/module-lifecycle.md

## Purpose

The concrete, step-by-step procedure for adding or removing a domain module, including the exact registries to edit, the commands to run, and the paired-repo steps. It is the "what you actually type" companion to the conceptual reasoning in `modules.md`.

## Key elements

- **Five registries table** — enumerates every place a module is named (`enabledModules`, `MODULE_SECTIONS`, `ASYNC_SECTION_ORDER`, `SHARED_SECTIONS`, `FRONTEND_PAIRING`) and which are conditional on the domain serving HTTP, owning an `asyncapi.yaml`, or being browser-reachable.
- **Probes map** — `scripts/contracts/client-collections-bundle.ts` statically imports each module's `probes.ts` by name; deletion is a compile-time error, addition is guarded by `tests/cross-cutting/probes-are-wired.test.ts`.
- **Seed export** — replaces the old `SEED_SECTION_ORDER`; a module writes a `demo.ts`, `npm run seed:export` publishes the dataset, and `npm run check:seed-export` is the staleness gate.
- **Addition procedure (7 steps)** — `mkdir` + `module.ts` → one line in `src/modules.ts` → contract fragments + section entries → `npm run contracts:bundle` → `docs/modules/<name>.md` → copy shared files to the frontend → `npm run complete`.
- **Manifest shape** — the `AppModule` union type (`name`, optional `basePath`/`routes`, `locales`, `seeds`); headless modules omit `basePath`/`routes` entirely.
- **Folder layout reference** — the canonical file tree at `src/modules/<name>/` with a note on which files are "layers" vs. "subjects" and what decides placement of new files.
- **Removal procedure** — implied by the same claim read in reverse: `rm -rf` the folder, delete the line(s) from the registries, regenerate bundles, remove from the paired repo; anything that still breaks is real coupling.

## Relationships

- **`docs/theory/modules.md`** — the conceptual "why" behind the module shape; this page is its procedural twin.
- **`docs/theory/strategic-ddd.md`** — defines the four kinds of cross-domain relationship that the manifest docblock should name in prose.
- **`docs/api/contract-fragmentation.md`** — explains how `openapi.yaml`, `asyncapi.yaml`, and `probes.ts` fragments are read and assembled; the section-entry rules here feed that mechanism.
- **`docs/reference/src-modules.md`** — the vocabulary table for file shapes; a new module with a unique shape gets a row here.
- **`docs/modules/wishlist.md`** — the reference module added under this procedure and the smallest docs page to copy when writing `docs/modules/<name>.md`.
- **`docs/theory/index.md`** — the landing page that links into this page as the "how to add/remove" entry.
- **`docs/theory/layers.md`** — describes the layering convention (routes → service → repository → domain) that the folder layout here encodes.
- **`docs/theory/reading-path.md`** — positions this page in the reader's sequence (read `modules.md` first, then this one when you actually create or delete a domain).

## Notes

- `enabledModules` ordering is kept **alphabetical** by convention; order only affects route-mounting sequence, which is irrelevant for distinct base paths.
- A contract fragment on disk **without** a section entry is silently ignored (endpoint ships undocumented); a section entry without a fragment is a loud build error. The asymmetry matters.
- `SHARED_SECTIONS` vs. non-shared is the quiet asyncapi failure: omitting a browser-reachable channel means the frontend generates types that never mention it.
- The `probes.ts` import is deliberately **static** (not dynamic) so that deleting a module fails at compile time rather than producing a silently short bundle at runtime.
- The manifest docblock (the prose above `export default`) is where cross-domain reads/relationships are declared; it is the only place a reader sees both the `import` list and the rationale together.
- `analytics.ts` and `demo.ts` need **no** registry entry — both are swept from disk by their respective tests/gates.
