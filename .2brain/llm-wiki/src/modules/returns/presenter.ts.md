---
source: src/modules/returns/presenter.ts
sha256: cef15ded3e7319b1b9da97d55ab65935669d6d6104298d436c98df7ce74bb50b
generated_at: 2026-10-29T05:39:50.245287+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/presenter.ts

## Purpose

Single responsibility: convert a `ReturnDocument` (as stored in the database) into the `StoredReturn` shape that the API contract expects, before the read service layers on caller-specific `actions`.

## Key elements

- **`StoredReturn`** (type export) — `Omit<Return, 'actions'>`. Represents the return document in wire form minus the action list the read service adds later.
- **`presentReturn`** (function export) — Takes a `ReturnDocument`, calls its `.toJSON()` method (which renames `_id` → `id` and serialises dates to ISO strings), and casts the result to `StoredReturn`.

## Relationships

- **`src/modules/returns/model.ts`** — Supplies the `ReturnDocument` type that `presentReturn` accepts as input.
- **`src/types/index.ts`** — Supplies the `Return` type used to derive `StoredReturn`.
- **`src/modules/returns/services/read.ts`** — Downstream consumer; calls `presentReturn` first, then augments the result with `actions` to fulfil the full `Return` contract.
- **`src/modules/returns/repository.ts`** — Upstream producer; fetches `ReturnDocument` instances from storage that flow into `presentReturn`.

## Notes

- The `as StoredReturn` cast exists because `document.toJSON()` returns a loosely-typed shape the compiler can't reconcile with `Return` on its own. The runtime transform is real (field rename, date serialisation) but invisible to the type system, so the cast is load-bearing, not a shortcut.
- This file intentionally does **not** produce a full `Return`; the `actions` field is always absent here by design.
