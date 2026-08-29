# docs/theory/architecture.md

## Purpose

Describes the five major architectural blocks (Contract, Entry, Business core, Persistence, Cross-cutting tools) and the boundaries between them. Exists to answer *"which blocks talk to each other?"* — a conceptual question distinct from the folder-mapping question handled by `layers.md`.

## Key elements

- **Architecture frame (mermaid flowchart):** Left-to-right flow from OpenAPI/AsyncAPI contracts through HTTP/realtime entry, business core, persistence, and MongoDB, with cross-cutting concerns (Security, Redis cache, RabbitMQ queue, Observability) feeding into Entry and Core.
- **"What each block owns" table:** For each of the five blocks, lists what it owns (e.g., Contract → public request/event shapes; Business core → orchestration, Zod validation) and what it explicitly avoids (e.g., Entry avoids deep business decisions; Persistence avoids HTTP response logic).
- **Design rules:** SOLID (one reason to change per layer), DRY (shared logic stays in the owning domain's barrel — never a global `utils/`), KISS, and a "future-proof" seam rule (ports like `payments/providers/` can live at domain level, not just infrastructure level).
- **Two-axis warning callout:** Layers (this page) are conceptual blocks, not directories. The repo is partitioned first by **domain** (13 module folders); layers exist *inside* each domain. The old `src/controllers`, `src/services`, `src/models` directories were deleted once the last domain was migrated.

## Relationships

- **`docs/theory/domain-layer.md`** — This page explicitly defers to the domain axis for the question of *where a file lives*. The DRY rule and the "thirteen module folders" statement both depend on the domain-first organisation described there. The two pages compose: domain decides the folder, layer decides the responsibility within that folder.

## Notes

- The page references `./layers.md` and `./modules.md` as sibling pages that complete the picture; `architecture.md` intentionally omits folder paths to avoid duplicating `layers.md`.
- "Cross-cutting tools" (Winston, Prometheus, OTel, RabbitMQ, Redis) are listed as a block but are not a folder — they are hooks/libraries that span the other four blocks.
- The DRY rule is counter-intuitive: two modules needing the same rule is *not* a reason to extract it into a shared layer; it stays in whichever domain owns the business logic.
