---
source: src/modules/tasks/presenter.ts
sha256: 95fc618173a7659acf438005f3a94725c771f04d56592b1b6c67caee46b4c36a
generated_at: 2026-11-14T22:09:31.937908+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/presenter.ts

## Purpose

Single transformation point that turns a stored `TaskDocument` into the wire shape declared in `openapi.yaml`. It layers per-reader computed fields (`overdue`, `actions`, `assigneeName`, `earlierTasks`) onto the stored record and provides the inbox row projection. Every consumer that returns a task to a client (contact-form 201, staff reads, etc.) goes through this file so the mapping lives in exactly one place.

## Key elements

- **`StoredTask`** (type) — `Task` minus the four reader-computed fields. Represents the task exactly as it leaves storage.
- **`TaskView`** (interface) — The per-reader additions: `actions` (flags), optional `assigneeName`, optional `earlierTasks`.
- **`storedTaskOf(document)`** — Calls the model's `toJSON()` (handles `_id → id` and date-to-ISO-string) and casts to `StoredTask`.
- **`withView(stored, view, now?)`** — Merges a `StoredTask` with a `TaskView`; computes `overdue` as "open **and** `dueAt` is in the past" using the supplied clock (defaults to `new Date()`).
- **`presentTask(document, view)`** — Convenience: `storedTaskOf` + `withView` in one call.
- **`previewOf(message)`** (private) — Truncates to `PREVIEW_LENGTH` (160) *grapheme clusters* via `Intl.Segmenter`, appending `…`; never splits a surrogate pair or composed emoji.
- **`presentTaskListItem(task)`** — Projects a fully-presented `Task` into a `TaskListItem` row for the staff inbox, including the message preview and omitting `undefined` optional fields.

## Relationships

- **`src/types/index.ts`** (`@types`) — Source of the `Task`, `TaskListItem`, and `TaskRef` wire types this file maps to.
- **`src/modules/tasks/domain/index.ts`** (`./domain`) — Re-exports `isOpen` (status check used for the `overdue` computation) and the `TaskActionFlags` type.
- **`src/modules/tasks/model.ts`** (`./model`) — Provides `TaskDocument`; its `toJSON()` method performs the storage-to-wire field renaming that `storedTaskOf` relies on.

## Notes

- `overdue` is **always** recomputed at read time from `dueAt` and the clock; there is no background sweep keeping it current. Passing an explicit `now` to `withView` makes it testable.
- `previewOf` uses `Intl.Segmenter` for grapheme-cluster-aware slicing. The length is measured in *characters* (segments), not UTF-16 code units, so a 160-character preview of emoji-heavy text is shorter in bytes than a 160-byte slice would be.
- `presentTaskListItem` deliberately omits `message`, `notes`, and sender account details — those belong to the audited detail read, not the inbox row.
