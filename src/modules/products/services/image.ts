/**
 * @module
 * The pending-image hand-off: queue the digest job for a just-persisted product.
 */

import { enqueueIfImagePending } from '@infrastructure/adapters/image.worker';
import type { ProductDocument } from '../model';
import { productRepository } from '../repository';

/**
 * Enqueue the digest job for a just-persisted product, when its write carried a pending upload.
 * `pendingImageKey` here means the queue looked ready at upload time (the no-broker path resolves
 * inline before saving, see `readUploadedImage`) — see {@link enqueueIfImagePending} for what
 * happens with it.
 */
export const enqueueIfPending = (product: ProductDocument): Promise<ProductDocument> =>
    enqueueIfImagePending(product, 'products', productRepository.writebackImage);
