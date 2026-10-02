/**
 * @module
 * In any module: what it holds about one person, for the two things the account does with it — an
 * export (`collect`) and an erasure (`erase`). Declared on the manifest as `personalData`; `account`
 * and `users` call these without importing this module.
 *
 * See: docs/theory/modules.md#the-manifest
 */

import type { ClientSession } from 'mongoose';
import type { Example } from '@types';
import { imageStore } from '@infrastructure/adapters/image-store';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { MAX_CONFIGURED_PAGE_SIZE, readAll } from '@infrastructure/persistence/search';
import type { AfterErase, PersonalDataSubject } from '@kernel/registry';
import { presentExampleRow } from '../presenter';
import { ownerNameOf } from './owner';
import { exampleRepository } from '../repository';

/**
 * Every example the subject owns, drafts and archived included, in the contract's shape.
 *
 * @param subject - who the export is about
 */
export const collectPersonalData = (subject: PersonalDataSubject): Promise<Example[]> =>
    Promise.all([
        readAll(
            (page) =>
                exampleRepository.findAll(
                    { userId: toObjectId(subject.userId) },
                    {
                        sort: { createdAt: -1, _id: 1 },
                        skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE,
                        limit: MAX_CONFIGURED_PAGE_SIZE
                    }
                ),
            MAX_CONFIGURED_PAGE_SIZE
        ),
        ownerNameOf(subject.userId)
    ]).then(([rows, ownerName]) =>
        exampleRepository.normalize(rows).map((row) => presentExampleRow(row, ownerName))
    );

/**
 * Delete everything the user owns, inside the erasure's transaction. The cover images are files,
 * not rows, so they cannot roll back: they go in the returned step, which runs only after a commit.
 *
 * @param userId - the account being erased
 * @param session - the erasure's transaction
 */
export const eraseForUser = (userId: string, session: ClientSession): Promise<AfterErase> =>
    exampleRepository
        .deleteAllOf(userId, session)
        .then(
            (imageUrls) => () =>
                Promise.all(imageUrls.map((imageUrl) => imageStore.remove(imageUrl))).then(
                    () => undefined
                )
        );
