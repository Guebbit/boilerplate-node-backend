# docs/theory/reading-path.md

## Purpose

A sequenced onboarding guide that tells a new reader exactly which nine source files to open, in what order, and what to skip. It exists so a contributor can build a correct mental model of the architecture without reading all ~21,000 lines of production code.

## Key elements

- **Mermaid flowchart** – visual 9-step reading order from `src/app.ts` through `src/infrastructure/http/response.ts`, colour-coded by phase (boot / module / request).
- **Nine numbered sections** – each names a file, gives its line count, and ends with a bolded **Take away** one-liner (e.g. "once you have read one controller, you have read all 60").
- **"Then: pick your next question" table** – routes the reader to the correct deeper page based on their next task (request flow, layering, module lifecycle, OpenAPI, tooling).
- **"What to skip on a first pass" table** – lists adapters, observability, OpenAPI fragments, the `account` module, `src/cluster.ts`, and tool configs with a "read this when…" condition for each.
- **"The five rules the code assumes you know"** – a compact invariant list (module-as-value, downward-only imports, contract-as-output, single-responsibility per layer, `id` vs `_id` border).

## Relationships

- **docs/theory/request-flow.md** – linked as the next stop for tracing a request through the middleware stack.
- **docs/theory/layers.md** – linked for the import-direction rules; the "five rules" section restates the layering invariant in shorthand.
- **docs/theory/module-lifecycle.md** – linked for adding or removing a domain; section 4 (`products/module.ts`) is the concrete example that page generalises.
- **docs/theory/clustering.md** – linked from the "skip" table for `src/cluster.ts`.
- **docs/theory/index.md** – parent index that lists this page as the entry point into the theory section.
- **docs/api/openapi-workflow.md** – linked for changing an endpoint's contract; rule 3 (contract-as-output) is the one-line preview of that workflow.
- **docs/api/contract-fragmentation.md** – linked in the skip table alongside `src/modules/*/openapi/*`.
- **docs/reference/index.md** (File Glossary) – offered as the reverse-lookup alternative: "landed on a file you didn't recognise → look it up here."
- **docs/reference/src-app.md** – documents `src/app.ts`, the first file on the path; this page gives *why* to read it first and *what* to look for.
- **docs/tools/tools-explained.md** – linked twice (intro tip and next-question table) as the prerequisite for understanding the tooling layer before reading code.

## Notes

- The page explicitly frames itself as *the first hour*, not a reference: it names files and says what to skip, but does not define the abstractions (that is `layers.md`, `registry`, etc.).
- Section 6 includes a 6-line pseudocode skeleton of every controller; the "Take away" warns that all ~60 controllers follow it, so reading one is sufficient.
- The "five rules" section is a distilled invariant list meant to be memorised before diving into deeper pages; it is not exhaustive documentation of layering or contracts.
- Tip blocks at the top act as a triage: tooling-first readers go to `tools-explained.md`, file-lookup readers go to the reference glossary, and only then does the reader continue with the nine-step path.
