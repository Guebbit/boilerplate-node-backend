/**
 * @module
 * One account's 2FA write, as DATA: what a request changed on its loaded copy, and the single
 * atomic update that applies only that.
 *
 * ```
 * loaded copy ──► planTwoFactorWrite ──► TwoFactorWrite ──► twoFactorWritePipeline ──► one updateOne
 * ```
 *
 * Why not `save()`: it `$set`s the whole `twoFactorMethods` array as it was loaded. A request that
 * loaded it before another claimed a TOTP step wrote the stale step back (RFC 6238 §5.2 replay),
 * and any two requests touching different methods failed each other with a version error.
 * See docs/modules/account-two-factor.md#concurrent-writes.
 */

import type { Types } from 'mongoose';
import type { UserDocument, TwoFactorMethodRecord } from './model';

/**
 * The fields of an entry that a write may carry, besides `_id` and `method`. `lastUsedStep` is in
 * the list but only ever UNSET by a write: claiming a step belongs to `claimTotpStep` alone.
 */
const ENTRY_FIELDS = [
    'enrolledAt',
    'secret',
    'lastUsedStep',
    'codeHash',
    'codeExpiresAt',
    'codeSentAt',
    'codeAttempts'
] as const;

/** One entry field name a write may carry. */
type EntryField = (typeof ENTRY_FIELDS)[number];

/** What a request changed on one entry that already exists in the database. */
export interface EntryChange {
    /** The entry's own id — what the update finds it by, so a concurrent re-order cannot misdirect it. */
    id: Types.ObjectId;
    /** Fields given a new value. */
    set: Partial<Record<EntryField, unknown>>;
    /** Fields removed. */
    unset: EntryField[];
}

/**
 * Everything one persist of the 2FA state changes, per method and on the account itself.
 */
export interface TwoFactorWrite {
    /** Entries that exist already and changed. */
    changed: EntryChange[];
    /** Entries created by this request, written whole. */
    added: TwoFactorMethodRecord[];
    /** Method names removed outright, or every entry. */
    dropped: readonly string[] | 'all';
    /** Account-level fields given a new value (the armed flag, backup codes, the session epoch). */
    set: Record<string, unknown>;
    /** Account-level fields removed. */
    unset: string[];
    /** Drop the backup codes and their salt when, after this write, no entry is armed. */
    discardCodesIfDisarmed: boolean;
    /** A first set of backup codes, stored only if the account holds none by the time the write lands. */
    mintCodes?: MintedBackupCodes;
}

/** A backup-code set as stored: the digests and the salt they were scrypt'd under. */
export interface MintedBackupCodes {
    /** The salt the digests were hashed with — also how a caller recognises its own set afterwards. */
    salt: string;
    /** The stored digests. */
    digests: string[];
}

/** What the write left in the document, read back in the same atomic step. */
export interface TwoFactorWriteOutcome {
    /** When the account became armed, or `undefined` when it holds no armed entry. */
    enabledAt?: Date;
    /** The salt of the backup-code set that is stored now, if any. */
    backupCodeSalt?: string;
    /** How many backup codes are stored now. */
    backupCodeCount: number;
}

/** The two options a caller adds to a plan beyond what its loaded copy changed. */
export interface TwoFactorWriteOptions {
    /** Methods removed from the copy, or `'all'`. */
    dropped?: readonly string[] | 'all';
    /** See {@link TwoFactorWrite.discardCodesIfDisarmed}. */
    discardCodesIfDisarmed?: boolean;
    /** See {@link TwoFactorWrite.mintCodes}. */
    mintCodes?: MintedBackupCodes;
}

/** Whether `field` may be SET by a write — everything but `lastUsedStep`. */
const settable = (field: EntryField): boolean => field !== 'lastUsedStep';

/** `value` as a plain, storable thing: a Mongoose array becomes an array, everything else is itself. */
const plain = (value: unknown): unknown => {
    if (!Array.isArray(value)) return value;
    const items: unknown[] = value;
    return [...items];
};

/**
 * Whether an entry was created by this request: Mongoose's own `$isNew` on a subdocument. Read
 * with `Reflect` because `TwoFactorMethodRecord` types the plain record, while the loaded array
 * holds hydrated subdocuments.
 */
const isNewEntry = (entry: TwoFactorMethodRecord): boolean => Reflect.get(entry, '$isNew') === true;

/**
 * The fields of one loaded entry the request set — the subdocument's own record of what was
 * assigned (`Document#directModifiedPaths`), so a field the request never touched is never
 * written, and a splice of its neighbours cannot move it. Read with `Reflect` for the same reason
 * as {@link isNewEntry}.
 *
 * @param entry - the subdocument, as the request left it
 */
const modifiedFieldsOf = (entry: TwoFactorMethodRecord): EntryField[] => {
    const read: unknown = Reflect.get(entry, 'directModifiedPaths');
    const paths: unknown = typeof read === 'function' ? Reflect.apply(read, entry, []) : [];
    return Array.isArray(paths) ? ENTRY_FIELDS.filter((field) => paths.includes(field)) : [];
};

/**
 * The diff of one loaded entry: the fields the request changed, sorted into set and unset.
 *
 * @param entry - the subdocument, as the request left it
 * @param id - its `_id`
 */
const changeOf = (entry: TwoFactorMethodRecord, id: Types.ObjectId): EntryChange => {
    const change: EntryChange = { id, set: {}, unset: [] };
    for (const field of modifiedFieldsOf(entry)) {
        const value = entry[field];
        if (value === undefined) change.unset.push(field);
        else if (settable(field)) change.set[field] = value;
    }
    return change;
};

/** Whether an {@link EntryChange} carries anything to write. */
const isEmptyChange = (change: EntryChange): boolean =>
    change.unset.length === 0 && Object.keys(change.set).length === 0;

/** An entry as a plain record, ready to be written whole. */
const wholeEntry = (entry: TwoFactorMethodRecord): TwoFactorMethodRecord => ({
    ...(entry._id && { _id: entry._id }),
    method: entry.method,
    ...Object.fromEntries(
        ENTRY_FIELDS.filter((field) => entry[field] !== undefined).map((field) => [
            field,
            entry[field]
        ])
    )
});

/**
 * Account-level paths the write DERIVES inside the database, from the array as it is stored then.
 * A copy's own value for them is a guess from what it loaded, and sending it is how two requests
 * left the flag disagreeing with the factors.
 */
const DERIVED_PATHS = new Set(['twoFactorEnabledAt']);

/**
 * The account-level paths a request changed, other than the method array and the derived ones: the
 * backup codes and their salt when set outright, the session epoch.
 *
 * @param user - the loaded copy
 */
const accountChanges = (user: UserDocument): Pick<TwoFactorWrite, 'set' | 'unset'> => {
    const out: Pick<TwoFactorWrite, 'set' | 'unset'> = { set: {}, unset: [] };
    const paths = user
        .directModifiedPaths()
        .filter(
            (path) =>
                path !== '_id' && !path.startsWith('twoFactorMethods') && !DERIVED_PATHS.has(path)
        );

    for (const path of paths) {
        const value: unknown = user.get(path);
        if (value === undefined) out.unset.push(path);
        else out.set[path] = plain(value);
    }
    return out;
};

/**
 * Work out what a request changed on its loaded copy of an account's 2FA state.
 *
 * @param user - the loaded copy, credentials included, as the request left it
 * @param options - methods the request removed (the copy no longer holds them), and the two
 *   conditional backup-code instructions
 */
export const planTwoFactorWrite = (
    user: UserDocument,
    options: TwoFactorWriteOptions = {}
): TwoFactorWrite => {
    const { dropped = [], discardCodesIfDisarmed = false, mintCodes } = options;
    const entries = dropped === 'all' ? [] : [...user.twoFactorMethods];
    const added = entries
        .filter((entry) => !entry._id || isNewEntry(entry))
        .map((entry) => wholeEntry(entry));
    const changed = entries
        .flatMap((entry) => (entry._id && !isNewEntry(entry) ? [changeOf(entry, entry._id)] : []))
        .filter((change) => !isEmptyChange(change));

    return {
        changed,
        added,
        dropped,
        discardCodesIfDisarmed,
        ...(mintCodes && { mintCodes }),
        ...accountChanges(user)
    };
};

/**
 * Mark one entry's assigned fields as already written, so the next plan does not send them again.
 *
 * @param entry - the subdocument whose fields were just written by another door
 */
export const markEntryWritten = (entry: TwoFactorMethodRecord): void => {
    const unmark: unknown = Reflect.get(entry, 'unmarkModified');
    if (typeof unmark === 'function')
        for (const field of modifiedFieldsOf(entry)) Reflect.apply(unmark, entry, [field]);
};

/**
 * Mark a loaded copy as written, so its next write plans from here: the paths just sent are no
 * longer modified, and the entries it created are no longer new.
 *
 * @param user - the copy whose write landed
 */
export const settleTwoFactorWrite = (user: UserDocument): void => {
    for (const path of user.modifiedPaths()) user.unmarkModified(path);
    for (const entry of user.twoFactorMethods) {
        markEntryWritten(entry);
        Reflect.set(entry, '$isNew', false);
    }
};

/** Whether {@link TwoFactorWrite} changes anything at all. */
export const isEmptyWrite = (write: TwoFactorWrite): boolean =>
    write.changed.length === 0 &&
    write.added.length === 0 &&
    write.dropped.length === 0 &&
    write.dropped !== 'all' &&
    Object.keys(write.set).length === 0 &&
    write.unset.length === 0 &&
    !write.discardCodesIfDisarmed &&
    !write.mintCodes;

/** A value the aggregation language must take literally — a string starting with `$` is not a field path. */
const literal = (value: unknown) => ({ $literal: value });

/**
 * One entry after its change: the loaded entry merged with the new values, then stripped of the
 * unset fields. `$unsetField` is MongoDB 5.0+.
 * https://www.mongodb.com/docs/manual/reference/operator/aggregation/unsetField/
 */
const patched = (change: EntryChange): unknown => {
    let entry: unknown = {
        $mergeObjects: [
            '$$entry',
            Object.fromEntries(Object.entries(change.set).map(([k, v]) => [k, literal(v)]))
        ]
    };
    for (const field of change.unset) entry = { $unsetField: { field, input: entry } };
    return entry;
};

/**
 * The method array after the write: drop what was dropped (and what an added entry replaces),
 * patch what changed by its own id, then append what is new.
 *
 * Aggregation pipeline: https://www.mongodb.com/docs/manual/reference/operator/aggregation/
 */
const methodsAfter = (write: TwoFactorWrite) => {
    const addedMethods = write.added.map((entry) => entry.method);
    const dropNames = write.dropped === 'all' ? [] : [...write.dropped, ...addedMethods];
    const kept =
        write.dropped === 'all'
            ? []
            : {
                  $filter: {
                      input: { $ifNull: ['$twoFactorMethods', []] },
                      as: 'entry',
                      cond: { $not: [{ $in: ['$$entry.method', literal(dropNames)] }] }
                  }
              };
    const patchedKept =
        write.changed.length === 0 || write.dropped === 'all'
            ? kept
            : {
                  $map: {
                      input: kept,
                      as: 'entry',
                      in: {
                          $switch: {
                              branches: write.changed.map((change) => ({
                                  case: { $eq: ['$$entry._id', change.id] },
                                  // eslint-disable-next-line unicorn/no-thenable -- `$switch` spells its branch `{ case, then }`
                                  then: patched(change)
                              })),
                              default: '$$entry'
                          }
                      }
                  }
              };

    return { $concatArrays: [patchedKept, literal(write.added)] };
};

/** Scratch field holding "is any stored entry armed" between the two derived stages; never persisted. */
const ARMED_FIELD = '__armed';

/**
 * The two stages that derive the armed flag and the backup-code set from the array as stored after
 * the write. Separate from the stage that writes the array because a `$set` stage reads the
 * document as it was before that stage.
 *
 * - the flag keeps its date while armed and goes when no entry is;
 * - a minted set lands only on an armed account that holds no code yet;
 * - a discard empties the set only when no entry is armed.
 */
const derivedStages = (write: TwoFactorWrite): Record<string, unknown>[] => {
    const armed = `$${ARMED_FIELD}`;
    const storedCodes = { $ifNull: ['$twoFactorBackupCodes', []] };
    const mints = {
        $and: [armed, { $eq: [{ $size: storedCodes }, 0] }]
    };
    const discards = { $not: [armed] };
    const codes = write.mintCodes
        ? { $cond: [mints, literal(write.mintCodes.digests), storedCodes] }
        : write.discardCodesIfDisarmed
          ? { $cond: [discards, [], storedCodes] }
          : undefined;
    const salt = write.mintCodes
        ? { $cond: [mints, literal(write.mintCodes.salt), '$twoFactorBackupCodeSalt'] }
        : write.discardCodesIfDisarmed
          ? { $cond: [discards, '$$REMOVE', '$twoFactorBackupCodeSalt'] }
          : undefined;

    return [
        {
            $set: {
                [ARMED_FIELD]: {
                    $anyElementTrue: [
                        {
                            $map: {
                                input: { $ifNull: ['$twoFactorMethods', []] },
                                as: 'entry',
                                in: { $ne: [{ $ifNull: ['$$entry.enrolledAt', null] }, null] }
                            }
                        }
                    ]
                }
            }
        },
        {
            $set: {
                twoFactorEnabledAt: {
                    $cond: [armed, { $ifNull: ['$twoFactorEnabledAt', '$$NOW'] }, '$$REMOVE']
                },
                ...(codes && { twoFactorBackupCodes: codes }),
                ...(salt && { twoFactorBackupCodeSalt: salt })
            }
        },
        { $unset: ARMED_FIELD }
    ];
};

/**
 * The one aggregation-pipeline update that applies a {@link TwoFactorWrite}.
 * Run it with `timestamps: false`: a factor's own bookkeeping is not an edit of the account.
 *
 * @param write - what the request changed
 * @returns the update stages for `updateOne(filter, stages, { timestamps: false })`
 */
export const twoFactorWritePipeline = (write: TwoFactorWrite): Record<string, unknown>[] => {
    const touchesMethods =
        write.changed.length > 0 ||
        write.added.length > 0 ||
        write.dropped === 'all' ||
        write.dropped.length > 0;
    const set = {
        ...Object.fromEntries(Object.entries(write.set).map(([k, v]) => [k, literal(v)])),
        ...(touchesMethods && { twoFactorMethods: methodsAfter(write) })
    };
    const derives = touchesMethods || write.discardCodesIfDisarmed || Boolean(write.mintCodes);

    return [
        ...(Object.keys(set).length > 0 ? [{ $set: set }] : []),
        ...(write.unset.length > 0 ? [{ $unset: write.unset }] : []),
        ...(derives ? derivedStages(write) : [])
    ];
};
