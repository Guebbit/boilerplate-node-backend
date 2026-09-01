# BE-2 — Inventory reservations & transitions — frozen expectations

Blind read of Tier A spec only:
- `src/modules/inventory/openapi.yaml`
- `asyncapi.yaml` (repo root, bundled — sources per its header comment: `shared/contracts/asyncapi.root.yaml`, `src/modules/observability/asyncapi.yaml`, `shared/contracts/asyncapi.workers.yaml`)

No implementation or test file was opened before this file was written and committed.

## Expectations

- **E1** (`src/modules/inventory/openapi.yaml:162-171`) — `StockMovementReason` has exactly six values, each with a fixed, opposite-signed pair of counter effects:
  - `reserve`: `reserved` up, `onHand` unchanged.
  - `commit`: `onHand` down AND `reserved` down (both, same row).
  - `release`: `reserved` down, `onHand` unchanged.
  - `expire`: `reserved` down, `onHand` unchanged (same counter arithmetic as `release`).
  - `receive`: `onHand` up, `reserved` unchanged.
  - `adjust`: `onHand` moves either direction (signed), `reserved` unchanged.

- **E2** (`openapi.yaml:173-175,186-193`) — Every `StockMovement` row carries BOTH `onHandDelta` and `reservedDelta` (both required, both signed integers, either may be `0`). Summing each column over one product's rows must reproduce that product's current `onHand`/`reserved` counters (ledger is replayable).

- **E3** (`openapi.yaml:173-175`) — The movement ledger is append-only: no update/delete path: a wrong row is corrected only by a later row, never edited in place.

- **E4** (`openapi.yaml:7-14,26-27`) — `GET /inventory/levels` requires bearer auth (401 without) and is role-gated (403 for non-admin); returns items ordered most-scarce-first.

- **E5** (`openapi.yaml:18-24`) — `lowOnly=true` restricts the levels page to products at or under the deployment's low-availability threshold; default is `false` (unfiltered).

- **E6** (`openapi.yaml:39-40`) — `GET /inventory/movements` returns rows newest-first.

- **E7** (`openapi.yaml:40`) — `meta.totalItems` on the movements list counts every row matching the filters, not just the returned page — the endpoint must not silently cap history and misreport it as complete.

- **E8** (`openapi.yaml:46-58`) — Movements can be narrowed by `productId` and/or `reason` query params.

- **E9** (`openapi.yaml:75,296-306`) — `POST /inventory/receipts`: `quantity` must be `>= 1` (strictly positive; `422` otherwise). A receipt increases `onHand` only; `reserved` is untouched, so `available` rises immediately by the received quantity.

- **E10** (`openapi.yaml:311-323`, comment at 318-320: "Signed and non-zero") — `POST /inventory/adjustments`: `delta` is a signed, **non-zero** integer. Positive `delta` raises `onHand`; negative lowers it. `reserved` is untouched by an adjustment.

- **E11** (`openapi.yaml:102-103,122-124`) — An adjustment that would leave `onHand` below the product's current `reserved` count is refused with `409`, not applied partially and not allowed to make `available` negative.

- **E12** (`openapi.yaml:94,121`) — Both `receipts` and `adjustments` return `404` when `productId` does not reference an existing product.

- **E13** (`openapi.yaml:135-138`) — `POST /inventory/reservations/sweep` releases *every* hold whose window has closed in one call (not just one hold per call), and each release is meant to get the order behind it cancelled. Tier A does not specify the mechanism (sync call vs. async event) by which order-cancellation is triggered — see E16.

- **E14** (`openapi.yaml:138`) — Sweep is idempotent: running it again immediately, with no new expirations since, releases 0 holds (`expired: 0`), not a re-release of already-expired holds.

- **E15** (`openapi.yaml:328-336`) — The sweep response body is exactly `{ expired: <integer, minimum 0> }` — a plain count of holds released by *this* call. This is the only Tier-A-documented output field.

- **E16** (entire `asyncapi.yaml`, all channels enumerated at lines 34-113; no occurrence of "reservation" anywhere in the file) — **No asyncapi channel/event named `reservation.expired` (or anything reservation-related) exists in Tier A.** The only channels are `observability.metrics.snapshot`, `observability.metrics.updated`, `observability.heartbeat` (SSE) and `worker.email.send`, `worker.pdf.generate`, `worker.image.digest` (RabbitMQ). Consequently: Tier A gives no payload shape, no delivery channel, and no guarantee that reservation expiry is broadcast as an async message at all. Any test that asserts a `reservation.expired` event is published, or asserts on its shape, has no Tier A backing — at best SPEC-SILENT, and if it's treated as the *only* way orders learn of expiry (contradicting that no such contract exists), MISMATCH-SPEC.

- **E17** (`openapi.yaml:236-254`) — `available = onHand − reserved`, computed server-side once and republished on the product and on this board (not left for clients to derive by subtracting two fields themselves).

- **E18** (`openapi.yaml:164` — "`commit` — the order was paid for and the units left. Both down.") — A `commit` movement row has both `onHandDelta < 0` and `reservedDelta < 0` on the SAME row (not two separate rows, not just one counter).

- **E19** (`openapi.yaml:166-169`) — `release` and `expire` are arithmetically identical (`reserved` down, `onHand` unchanged); they differ only in the recorded `reason` (voluntary cancel vs. timeout), never in which counters move or by how much.

- **E20** (`openapi.yaml:59-69,77-96,106-129,139-151`) — `receive`, `adjust`, and `sweep` endpoints all require bearer auth (`401`) and are role-gated (`403`); `movements` additionally documents `422` for invalid filter/query input.
