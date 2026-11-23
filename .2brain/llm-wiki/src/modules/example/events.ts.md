---
source: src/modules/example/events.ts
source_sha256: 00950fa066e4e474bc45c03c3ea72bdfc76cdfc4c377650da792164a3c401a34
context_sha256: 8d38ffab752d3cef36f4fa9c6f24b0d40a39fd05b22495c651e9326cfd885e91
generated_at: 2026-11-22T05:08:50.806034+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/events.ts

## Purpose
Declares the domain event names that the `example` module emits. Currently it defines only `example.published`, whose channel is described in `./asyncapi.domain-events.yaml`. The file's header says it also becomes a public webhook through `module.ts`'s `publicEvents`, and that it can be deleted if the module announces nothing to the rest of the app.

## Key elements
- `EXAMPLE_PUBLISHED` — constant equal to `'example.published'`, checked with `satisfies DomainEventName` so it must be a valid kernel event name.

## Relationships
- `src/kernel/events.ts` — supplies the `DomainEventName` type that the constant is checked against (type-only import).
- `src/modules/example/module.ts` — per the header comment, the event becomes a public webhook via this file's `publicEvents`.

## Notes
- Because of the `satisfies DomainEventName` check, the event name must also be registered in the kernel's event typing. Otherwise the file will not compile.
- The event's schema lives in `asyncapi.domain-events.yaml`, not in this file. This file holds only the name constant.
