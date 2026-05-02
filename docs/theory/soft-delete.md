# Soft Delete

## What it is

A soft delete marks a document as deleted without removing it from the database. The document stays in the collection but is filtered out from normal queries.

## Implementation

Models that support soft delete have an optional `deletedAt` field:

```ts
deletedAt: { type: Date, default: null }
```

- `deletedAt === null` → active document
- `deletedAt = new Date()` → soft-deleted

## Visibility rules

The service layer applies filters based on the user's role:

```ts
if (!user?.admin) {
    filters.deletedAt = null; // hide soft-deleted from non-admins
    filters.active = true; // hide inactive items
}
```

Admins see everything. Public users only see active, non-deleted documents.

## Hard delete

Pass `?hardDelete=true` as a query parameter to permanently remove a document. This is an admin-only operation and bypasses the soft-delete mechanism entirely.

## Why soft delete?

- **Auditability** — deleted records are still accessible for reporting or recovery.
- **Referential integrity** — orders referencing a deleted product can still render the product name/price from the snapshot stored at order time.
- **Safe rollback** — a deleted document can be restored by clearing `deletedAt`.

## Trade-offs

- Queries must always filter `deletedAt = null` or you risk showing deleted data. The service layer handles this — the repository does not.
- The collection grows indefinitely. Schedule a periodic hard-delete job for documents soft-deleted beyond a retention window if storage is a concern.
