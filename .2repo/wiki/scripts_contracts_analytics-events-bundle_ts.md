# scripts/contracts/analytics-events-bundle.ts

## Purpose

Builds the generated file `src/infrastructure/observability/analytics-events.frontend.ts` — the list of Umami analytics event names the **paired frontend** emits. It slices the verbatim source text of the frontend-scoped constant out of `shared/contracts/analytics.frontend.ts`, validates it, and wraps it in a published header/footer. Only the frontend half is published; backend module names stay as ordinary TypeScript imported by their own controllers.

## Key elements

- **`SECTIONS`** – Ordered list of all eight analytics sections (7 backend modules + 1 frontend), each carrying the module name, exported constant name, the constant's value, and its `AnalyticsScope`.
- **`ANALYTICS_SECTIONS`** – Exported alias of `SECTIONS`, deliberately unfiltered so the cross-cutting test can check name collisions across *both* scopes.
- **`sliceOf()`** – Reads the module's source file and extracts the body of the object literal between `export const … = {` and `} as const;`, preserving comments and formatting.
- **`assertSliceMatches()`** – Verifies that every `NAME:` entry in the sliced text matches the keys of the imported constant, in order.
- **`assertNamespaceIsUnique()`** – Fails the build if any event *name* or *value* is claimed by two sections, enforcing the single-emitter-per-name rule.
- **`content()`** – Runs the guards, collects frontend-scope slices, and concatenates `HEADER` + slices + `FOOTER` into the final file string.
- **`analyticsEventsBundle`** – The `CompiledBundle` export (name, output path, `compiled: true`, `content`, `sources`) consumed by the bundler to write the output file.

## Relationships

- **`scripts/contracts/bundle-kinds.ts`** – Source of the `CompiledBundle` type and `REPO_ROOT` constant.
- **`shared/contracts/analytics.frontend.ts`** – Sliced verbatim as the sole source of the frontend event names; also imported as a value for the uniqueness check.
- **`src/modules/{account,users,products,cart,wishlist,orders,payments}/analytics.ts`** – Imported for their event constants so `assertNamespaceIsUnique` can detect cross-scope collisions. Not written into the output.
- **`src/infrastructure/observability/analytics-events.frontend.ts`** – The generated output file this bundle produces.
- **`scripts/build-contract-bundles.ts`** – The task runner that invokes the bundle's `content()` and writes the output.
- **`tests/cross-cutting/contract-bundles.test.ts`** – Consumes `ANALYTICS_SECTIONS` to assert namespace uniqueness and bundle integrity.

## Notes

- **Verbatim slicing, not regeneration.** The body is copied byte-for-byte from the source file because declarations carry comments that a rebuild-from-values would drop. `assertSliceMatches` is the only link between the text slice and the runtime value.
- **Trailing-comma sensitivity.** Sections are joined with `,\n\n`; a dangling comma before the closing `}` fails `prettier --check`. The `FOOTER` starts with `}` on its own line to avoid this.
- **Committed, not on-demand.** The output file is checked into the repo because `check:spec-identity` hash-compares it across the two repositories; a file that only exists after a build step would make that check vacuous.
- **No backend counterpart exists by design.** A module's own names are imported directly by its controllers; a published copy would have no reader in either repo.
- **`const` object, not `enum`.** The published file uses `export const analyticsEvents = { … } as const` because the frontend's lint rule requires `E`-prefixed enum names while the backend's does not; a single `enum` cannot satisfy both.
