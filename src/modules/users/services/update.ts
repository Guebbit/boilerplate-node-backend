/**
 * @module
 * Admin-side user update: field assignment, save-and-react, and the audit row.
 */

import type { ClientSession } from 'mongoose';
import {
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { decryptPii, encryptPii } from '@infrastructure/security/pii-encryption';
import { imageStore, applyImageWriteback } from '@infrastructure/adapters/image-store';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { rearmPrecondition } from '@infrastructure/persistence/versioning';
import { withTransaction } from '@infrastructure/runtime/database';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext, UpdateUserByIdRequest, WithServerImage } from '@types';
import { enqueueOutboxEvent, nudgeOutbox } from '@kernel/outbox';
import { phoneAad, type UserDocument } from '../model';
import { userRepository } from '../repository';
import { usersAuditActions } from '../audit';
import { USER_PROFILE_CHANGED, type UserChangedField } from '../events';
import { enqueueIfPending } from './image';
import { userAuditChanges } from './audit-changes';
import { withClearedAccount } from './cleared-account';

/**
 * Update an existing user document. Returns a result envelope instead of throwing, the protocol
 * every service here follows.
 *
 * @internal The step beneath `updateById` (which asks the staff-role question first) and
 * `updateOwnProfile`. Unpublished, a sibling could edit a staff account without the check.
 *
 * Typed off `UpdateUserByIdRequest` rather than a hand-picked `Pick`, so a field added to the
 * contract reaches the write.
 */
export const update = (
    user: UserDocument,
    data: WithServerImage<Omit<UpdateUserByIdRequest, 'role'>> & {
        /**
         * Not on `UpdateUserByIdRequest` either — consent is `account`'s own self-service field
         * (`UpdateAccountRequest`), deliberately absent from the ADMIN `/users/:id` contract:
         * consent is the data subject's to give, never an operator's to set on their behalf.
         * Rides along the same way the image fields do, from the one caller (`account`'s
         * `updateProfile`) that actually has one to pass.
         */
        analyticsConsent?: boolean;
    },
    /** {@link SaveHook}: a write that must commit with this save, from the one caller that has one. */
    alsoInSave?: SaveHook
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // Read before anything is assigned onto the document.
    const changed = rectifiedFields(user, data);
    if (data.username !== undefined) user.username = data.username;
    /**
     * The old url is captured before the overwrite so the save can delete it once
     * the new one is durably saved — see `applyImageWriteback`'s own docblock for the gate
     * shared with `products/services/crud.ts`'s own `update`. `null` unsets the field, and the
     * same old-url capture then deletes the file and its thumbnail.
     */
    const oldImageUrl = applyImageWriteback(user, data);
    /**
     * The preference that outlives the request — see the `locale` field on the user
     * schema. `null` clears the override — $unset on save.
     */
    if (data.locale !== undefined) user.locale = clearedOrValue(data.locale);
    if (data.phone !== undefined)
        user.phone = data.phone === null ? undefined : encryptPii(data.phone, phoneAad(user.id));
    if (data.website !== undefined) user.website = clearedOrValue(data.website);
    /**
     * Absent leaves the stored choice alone, same as every field above; only an explicit
     * boolean changes it. The date moves with the answer: the first one, or a different one.
     */
    if (
        data.analyticsConsent !== undefined &&
        (user.analyticsConsentAt === undefined || data.analyticsConsent !== user.analyticsConsent)
    ) {
        user.analyticsConsent = data.analyticsConsent;
        user.analyticsConsentAt = new Date();
    }

    return saveThenClean(user, oldImageUrl, announcing(user, changed, alsoInSave)).then(
        (result) => {
            // After the commit, never inside it: the relay reads rows that are already durable.
            if (changed.length > 0) nudgeOutbox();
            return result;
        }
    );
};

/**
 * Which personal-data fields a change-set really moves (GDPR Art. 19: only a rectification is
 * announced, so a PUT that resends what is stored says nothing).
 *
 * The phone is stored encrypted under a random IV, so two equal numbers never match as stored.
 * The plaintexts are compared instead. Call it BEFORE the change-set is assigned.
 *
 * @param user - the loaded account, not yet changed
 * @param data - the change-set; an absent key leaves the field alone, `null` clears it
 */
const rectifiedFields = (
    user: UserDocument,
    data: Pick<Parameters<typeof update>[1], 'username' | 'phone' | 'website' | 'imageUrl'>
): UserChangedField[] => {
    const storedPhone = user.phone
        ? decryptPii(user.phone, phoneAad(user.id), 'user phone')
        : undefined;
    // Mirrors `applyImageWriteback`: `null` removes, an empty or equal url leaves it alone.
    const imageMoved =
        data.imageUrl === null
            ? user.imageUrl !== undefined
            : !!data.imageUrl && data.imageUrl !== user.imageUrl;
    const moved: Record<Exclude<UserChangedField, 'email'>, boolean> = {
        username: data.username !== undefined && data.username !== user.username,
        phone: data.phone !== undefined && (data.phone ?? undefined) !== storedPhone,
        website: data.website !== undefined && (data.website ?? undefined) !== user.website,
        imageUrl: imageMoved
    };
    // `Object.keys` answers `string[]`; `moved` is built from exactly those field names.
    return (Object.keys(moved) as Exclude<UserChangedField, 'email'>[]).filter(
        (field) => moved[field]
    );
};

/**
 * The caller's own save hook, plus the `user.profile_changed` outbox row when a field moved, so
 * the announcement commits with the rectification or not at all.
 *
 * @param user - the account being saved
 * @param changed - {@link rectifiedFields}' answer
 * @param alsoInSave - the caller's own hook, kept first so its row lands first
 */
const announcing = (
    user: UserDocument,
    changed: UserChangedField[],
    alsoInSave?: SaveHook
): SaveHook | undefined =>
    changed.length === 0
        ? alsoInSave
        : (session) =>
              Promise.resolve(alsoInSave?.(session)).then(() =>
                  enqueueOutboxEvent(
                      USER_PROFILE_CHANGED,
                      { userId: user.id, changed },
                      user.id,
                      session
                  )
              );

/**
 * Another write that joins an update's transaction, so it commits with the document or not at all.
 * `account` uses it to write an outbox row beside a profile edit.
 */
export type SaveHook = (session: ClientSession) => Promise<unknown>;

/**
 * The document's save inside a transaction, joined by the caller's own write when it has one.
 *
 * @param user - the loaded, already-mutated document
 * @param alsoInSave - a caller's own write that joins the same transaction
 */
const saveInTransaction = (user: UserDocument, alsoInSave?: SaveHook): Promise<UserDocument> =>
    withTransaction((session) => {
        /**
         * The transaction may re-run this on a transient conflict: each attempt checks the caller's
         * `If-Match` against the row it holds, instead of the first attempt's having used it up.
         */
        rearmPrecondition();

        return userRepository
            .save(user, session)
            .then((saved) => Promise.resolve(alsoInSave?.(session)).then(() => saved));
    });

/**
 * Save the document, then clean up what the save made unreachable: the replaced avatar.
 *
 * @param user - the loaded, already-mutated document
 * @param oldImageUrl - the image the update replaced, or `undefined` when the avatar was not touched
 * @param alsoInSave - a caller's own write that joins the save's transaction
 */
const saveThenClean = (
    user: UserDocument,
    oldImageUrl?: string,
    alsoInSave?: SaveHook
): Promise<ResponseSuccess<UserDocument>> =>
    saveInTransaction(user, alsoInSave).then((saved) => {
        // Only after the commit: the old avatar is unreachable the moment the field is overwritten.
        const imageCleanup: Promise<void> = oldImageUrl
            ? imageStore.remove(oldImageUrl).then(() => undefined)
            : Promise.resolve();

        return imageCleanup.then(() => enqueueIfPending(saved)).then(generateSuccess);
    });

/** The shape of an admin update's data: the contract's body, plus the image fields the server decides. */
type UpdateByIdData = WithServerImage<UpdateUserByIdRequest>;

/**
 * The write half of {@link updateById}, once the staff-role protection has cleared: the update
 * itself, then its audit row.
 *
 * @param user - the loaded document
 * @param data - the request body
 * @param context - the caller
 */
const applyUpdate = (
    user: UserDocument,
    data: UpdateByIdData,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> => {
    // Read before `update` assigns onto the document.
    const metadata = userAuditChanges(user, data);

    return update(user, data).then((result) => {
        if (result.success)
            recordAudit(context, {
                action: usersAuditActions.ADMIN_USER_UPDATED,
                outcome: 'success',
                targetType: 'user',
                targetId: String(user._id),
                metadata
            });
        return result;
    });
};

/**
 * Update an existing user by ID: load the document, clear the staff-role protection, then
 * {@link applyUpdate}.
 *
 * @param id - the account being changed
 * @param data - the request body
 * @param context - the caller, whose keys and role protection decide what may change
 */
export const updateById = (
    id: string,
    data: UpdateByIdData,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    /**
     * The plain finder: an admin edit touches no credential, and the pending address is the
     * owner's to read (`GET /account`), so it stays unloaded and out of the answer.
     */
    withClearedAccount(id, context, (user) => applyUpdate(user, data, context));
