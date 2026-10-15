/**
 * @module
 * The pending-image hand-off: queue the digest job for a just-persisted user.
 */

import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';
import { afterCommit } from '@infrastructure/runtime/after-commit';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';

/**
 * Enqueue the digest job for a just-persisted user, when its write carried a pending upload.
 * `pendingImageKey` is only ever set while the queue looked ready at upload time — see
 * `quarantineUploadedImages`, and {@link enqueueIfImagePending} for what happens with it.
 *
 * Runs after the commit, so a failure is logged and the saved user answered: the account exists
 * either way, and the placeholder image waits for the quarantine reaper.
 */
export const enqueueIfPending = (user: UserDocument): Promise<UserDocument> =>
    afterCommit(
        'image enqueue',
        () => enqueueIfImagePending(user, 'users', userRepository.writebackImage),
        user,
        { userId: String(user._id) }
    );
