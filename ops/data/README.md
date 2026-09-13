# Data changes

One file per change: `<timestamp>-<slug>.ts`, exporting `up(db: Db): Promise<void>`. The filename
is the order — no phase, no `down`.

```ts
import type { Db } from 'mongodb';

export const up = (db: Db): Promise<void> =>
    db
        .collection('users')
        .updateMany({ fullName: { $exists: true } }, [
            {
                $set: {
                    firstName: { $arrayElemAt: [{ $split: ['$fullName', ' '] }, 0] },
                    lastName: { $arrayElemAt: [{ $split: ['$fullName', ' '] }, 1] }
                }
            },
            { $unset: 'fullName' }
        ])
        .then(() => undefined);
```

Two rules `npm run db:data` does not check for you:

- **Idempotent.** The ledger records that a file ran; it does not stop you writing one that
  corrupts a second run. Filter on the rows that still need the change.
- **Driver-level, never through a model.** `up`'s only parameter is the native `Db` — reach for
  `.collection(...)`, not an imported model. Today's schema, hooks and validators do not apply to
  rows this script exists because they no longer match.

`db:sync` remains the only author of indexes — a file here must never call `createIndex`,
`dropIndex` or `syncIndexes` (`tests/cross-cutting/data-migrations.test.ts` enforces it).

Delete a file once `npm run db:data -- --check` reports it applied everywhere real. See
`docs/reference/data.md`.
