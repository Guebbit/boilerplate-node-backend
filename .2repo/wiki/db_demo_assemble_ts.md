# db/demo/assemble.ts

## Purpose

Assembles the demo dataset (`db/demo/demo-data.json`) by reading rows back through every enabled module's serializer, validating internal consistency (no dangling references, shape labels in bijection with collections), and returning a deterministically ordered JSON string. It is a shared module so that the export script and the migration integration test both derive the dataset from a single implementation, eliminating the risk of two callers disagreeing about what the dataset is.

## Key elements

- **`DEMO_DATA_PATH`** — Resolved absolute path to `demo-data.json`. Uses `__dirname` (not `import.meta.dirname`) because tsx and ts-jest load this file as CommonJS.
- **`toPlainJson`** *(internal)* — JSON round-trip that converts live Mongoose types (`ObjectId`, nested `Date`) into plain primitives before any structural walk. Deliberately not `structuredClone`, which never invokes `toJSON`.
- **`isRecord`** *(internal)* — Type guard narrowing `unknown` → `Record<string, unknown>`; used by every walker.
- **`sortKeys`** *(internal)* — Recursively sorts object keys (localeCompare) for byte-stable output. Arrays keep their original order.
- **`collectIds`** *(internal)* — Gathers every `id` string value at any depth into a `Set<string>`.
- **`findDanglingReferences`** *(internal)* — Walks the dataset and reports any `*Id` field whose value is not in the known-id set. Throws if any are found.
- **`reconcileShapes`** *(internal)* — Verifies that `_meta.shapes` and the published collections are in exact bijection (no unlabelled, no orphaned). Throws a descriptive error otherwise.
- **`assembleDemoDataset`** *(export)* — The sole public function. Reads `seedExport()` from every `enabledModule`, merges the results, attaches `seedCredentials` and the shape map, runs both validations, and returns the formatted JSON string (4-space indent, trailing newline).

## Relationships

- **`src/modules.ts`** — Imports `enabledModules`; the function iterates over this list to collect each module's `seedExport` and `demoShapes`.
- **`src/kernel/registry.ts`** — Imports the `DemoShape` type used to type the `_meta.shapes` record.
- **`src/kernel/seed-accounts.ts`** — Imports `seedCredentials`, which is embedded in the dataset output.
- **`db/demo/demo-data.json`** — The file whose bytes `assembleDemoDataset` is designed to produce.
- **`scripts/export-demo-dataset.ts`** — One of the two callers; publishes the string against a freshly seeded database.
- **`tests/integration/db/migration-demo-data.test.ts`** — The other caller; re-derives the string against a post-migration database and hash-compares.

## Notes

- **Determinism is contractual.** The output is committed and hash-compared against a paired frontend. Three guarantees enforce it: fixtures pin their own `createdAt`, seed writes pass `{ timestamps: false }` so Mongoose doesn't overwrite them, and this file sorts both rows and every object key before serialising.
- **Collections are keyed by name, not module order.** Reordering `enabledModules` or renaming a module must not rewrite the file.
- **Arrays are never reordered.** Each module is responsible for its own row ordering; reordering (e.g. cart lines) would change the dataset's meaning.
- **The file throws rather than warns.** If shapes are unlabelled/orphaned or a dangling reference is found, `assembleDemoDataset` raises an `Error` with a `[seed-export]` prefix, so `npm run seed:export` writes nothing and the CI gate fails.
- **`structuredClone` is explicitly rejected** (eslint-disable with justification): it copies by the structured-clone algorithm and never calls `toJSON`, which would leave `ObjectId`/`Date` as class instances.
