# docs/api/index.md

## Purpose

Landing page for the API documentation section. It gives a one-glance overview of the API contract ecosystem (OpenAPI spec → tooling → implementation → tests), states the core conventions for REST style, and routes readers to the correct sub-page based on their task. It exists so neither humans nor AI need to guess which doc covers a given API question.

## Key elements

- **Mermaid flowchart** — visual map of the pipeline: `openapi.yaml` feeds Spectral linting, Prism/Bruno/Mockoon mocking, OpenAPI Generator type output, and the route/controller/service implementation, which is in turn constrained by tests.
- **"What matters most" list** — declares `openapi.yaml` and `asyncapi.yaml` as the two sources of truth (REST and async), asserts the boilerplate is intentionally generic, and prohibits fragmenting docs into per-request/per-response pages.
- **"Read by task" table** — the primary navigation aid; maps a reader's intent (change contract, rerun codegen, understand ownership, change async contracts, learn REST patterns, understand layers/tools) to a specific sibling doc.
- **"REST patterns used here"** — concise style guide: resource-oriented URLs, thin controllers, shared schemas/params/responses, consistent response handling for cross-cutting concerns, and a note that sample entities are illustrative, not binding.

## Relationships

- **`docs/api/openapi-workflow.md`** — linked as the destination for anyone changing the contract or its tooling; the "source of truth" claim in this page defers all spec-level detail there.
- **`docs/api/regenerating.md`** — linked for the "what to rerun after editing" question; this page only states that regeneration is a thing, without listing the commands.
- **`docs/api/endpoints.md`** — not directly linked in the visible content, but sits in the same section and would be the natural target for concrete endpoint documentation that this index explicitly groups rather than splits.

## Notes

- The page references `asyncapi-workflow.md` and `contract-fragmentation.md` in the task table, but those are **not** listed as graph neighbors here — they are siblings in the directory that this index points to.
- The boilerplate is deliberately generic; the sample entities (`users`, `products`, `orders`, `cart`, `admin`) are pattern examples, not a committed data model.
- The Mermaid diagram uses `classDef` styling (contract = green, tooling = amber, app = blue) purely for visual grouping; the colors carry no behavioral meaning.
