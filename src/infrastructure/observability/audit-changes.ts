/**
 * @module
 * The field-level diff an `*.updated` audit row carries in its `metadata`. Pure: it compares a
 * stored record with the change-set about to be applied, and says nothing about who or when.
 *
 * Two lists, because the audit collection is append-only and never scrubbed on erasure:
 *
 * `valued`: non-personal fields, recorded as `{ from, to }`.
 * `named`:  free text, personal data and bearer secrets, recorded by NAME only.
 *
 * A field in neither list is not audited at all. The allowlist is the privacy decision, so a new
 * field is invisible until someone chooses which list it belongs to.
 */

/** One field that moved: what it was and what it is now. An unset side is the absent key. */
export interface FieldChange {
    from?: unknown;
    to?: unknown;
}

/**
 * A {@link FieldChange} with no `null` in it: a side that is unset (`null` or `undefined`) is left
 * out, because a response never carries `null` (`docs/api/write-methods.md#empty-null-omitted`).
 *
 * @param from - the value before
 * @param to - the value after
 */
export const fieldChange = (from: unknown, to: unknown): FieldChange => ({
    ...(from === undefined || from === null ? {} : { from }),
    ...(to === undefined || to === null ? {} : { to })
});

/** What an update moved; each half is absent when it has nothing to say. */
export interface AuditChanges extends Record<string, unknown> {
    /** The `valued` fields that moved, as `{ from, to }`. */
    changes?: Record<string, FieldChange>;
    /** The `named` fields that moved, by name only. */
    changedFields?: string[];
}

/** Which fields an update is audited for, and in which form. */
export interface AuditedFields<TKey extends string> {
    /** Recorded with their old and new values. Never personal data. */
    valued: readonly TKey[];
    /** Recorded by name. Free text, personal fields, secrets. */
    named: readonly TKey[];
}

/**
 * Whether a stored and a requested value differ, treating an unset field and `null` alike.
 *
 * @param before - the stored value
 * @param after - the requested value
 */
const differs = (before: unknown, after: unknown): boolean =>
    JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);

/**
 * The audited fields an update moves. A field the change-set leaves out, or sends unchanged,
 * writes nothing.
 *
 * Call it BEFORE the change-set is assigned onto `before`: a hydrated document is updated in
 * place, and the old value is gone once it is.
 *
 * @param before - the stored record, not yet changed
 * @param data - the change-set; an absent key leaves the field alone, `null` clears it
 * @param fields - which fields are audited, and whether by value or by name
 * @returns `metadata` for the audit row: `{}` when nothing audited moved
 */
export const auditChanges = <TKey extends string>(
    before: Readonly<Partial<Record<TKey, unknown>>>,
    data: Readonly<Partial<Record<TKey, unknown>>>,
    fields: AuditedFields<TKey>
): AuditChanges => {
    const moved = (field: TKey): boolean =>
        data[field] !== undefined && differs(before[field], data[field]);

    const changes = Object.fromEntries(
        fields.valued
            .filter((field) => moved(field))
            .map((field) => [field, fieldChange(before[field], data[field])])
    );
    const changedFields = fields.named.filter((field) => moved(field));

    return {
        ...(Object.keys(changes).length > 0 ? { changes } : {}),
        ...(changedFields.length > 0 ? { changedFields } : {})
    };
};
