import { SetMetadata } from '@nestjs/common';
import { INVALIDATE_CACHE_METADATA_KEY } from '@nest/constants';

/**
 * Mark a route to invalidate one or more cache tags after successful writes.
 */
export const invalidateCache = (tags: string[]) =>
    SetMetadata(INVALIDATE_CACHE_METADATA_KEY, {
        tags
    });
