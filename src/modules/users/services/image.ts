/**
 * @module
 * The pending-image hand-off: queue the digest job for a just-persisted user.
 */

import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';

/**
 * Enqueue the digest job for a just-persisted user, when its write carried a pending upload.
 * `pendingImageKey` is only ever set while the queue looked ready at upload time — see
 * `quarantineUploadedImages`, and {@link enqueueIfImagePending} for what happens with it.
 */
export const enqueueIfPending = (user: UserDocument): Promise<UserDocument> =>
    enqueueIfImagePending(user, 'users', userRepository.writebackImage);
