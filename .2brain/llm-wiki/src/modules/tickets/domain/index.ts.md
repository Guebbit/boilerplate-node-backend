---
source: src/modules/tickets/domain/index.ts
sha256: a64220a2c3ad725335abefbf21605ac995bf1b7e8a584f35b94185ea3f710099
generated_at: 2026-10-29T06:02:24.163794+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/domain/index.ts

## Purpose

Barrel file that aggregates the public API of the tickets **domain layer**. It re-exports pure business rules (lifecycle transitions, action flags, ownership predicates, routing sets, and system-opening constructors) from sibling modules so that consumers import from a single entry point. The domain layer is lint-enforced to be free of Express, Mongoose, and any application-tier dependency; this file is the sole surface through which those rules are consumed.

## Key elements

- **`./lifecycle` re-exports** – `initialTicketStatus`, `isOpen`, `openKeyOf`, `OPEN_STATUSES`, `reopen`, `resolve`, `clear`, `markSpam`, plus types `TicketFacts`, `TicketPatch`, `TicketRefusal`, `Transition`. Defines the ticket state machine and status predicates.
- **`./actions` re-exports** – `actionsOf`, `ActionFacts`, `TicketActionFlags`. Derives which UI/service actions are permitted for a given ticket.
- **`./ownership` re-exports** – `ownTicketsFilter`, `OwnerRef`, `OwnTicketsFilter`. Encapsulates the "whose ticket is this?" query predicate.
- **`./routing` re-exports** – `ROUTED_SETS`, `routeSetOf`, `TICKET_KINDS`. Maps ticket kinds to their routed status sets.
- **`./system` re-exports** – `accountReviewOpening`, `amountMismatchOpening`, `consentDueOpening`, `disputeOpening`, `exportFailedOpening`, `paidWithoutHoldOpening`, `refundOwedOpening`, `refundRefusedOpening`, `SystemOpening`. Constructors for system-generated opening events.

## Relationships

- **Consumed by** `src/modules/tickets/service.ts`, `src/modules/tickets/repository.ts`, `src/modules/tickets/presenter.ts`, `src/modules/tickets/access.ts`, `src/modules/tickets/index.ts`, `src/modules/tickets/services/system.ts`, and `src/modules/tickets/services/workflow.ts` – all import domain rules through this barrel rather than reaching into submodules directly.
- **Consumed by tests** `tests/unit/lifecycle.test.ts` and `tests/unit/routing.test.ts`.
- **Re-exports from** `domain/lifecycle.ts`, `domain/actions.ts`, `domain/ownership.ts`, `domain/routing.ts`, `domain/system.ts`. No logic is defined here; behavior lives in those leaf modules.

## Notes

- This file contains **no executable code** beyond re-export statements. Lint rules guarantee that nothing in the domain layer imports from `model.ts`, `repository.ts`, `service.ts`, or any Express/Mongoose module.
- Adding a new domain rule means creating (or extending) a sibling module and then adding the export here; consumers should never import from `domain/lifecycle` etc. directly—always go through this index.
