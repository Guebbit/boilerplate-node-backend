import { SetMetadata } from '@nestjs/common';
import { CACHEABLE_METADATA_KEY } from '@nest/constants';

/**
 * Enable Redis response caching for a route handler.
 */
export const cacheable = (seconds = 0, tags: string[] = []) =>
    SetMetadata(CACHEABLE_METADATA_KEY, {
        seconds,
        tags
    });
