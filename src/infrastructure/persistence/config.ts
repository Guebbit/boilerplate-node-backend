/**
 * @module
 * Persistence configuration: the default page size.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';
import { sharedDefaults } from '@infrastructure/config/defaults.generated';

/** Paging. */
export const persistenceConfig = defineConfig({
    name: 'persistence',
    shape: {
        NODE_SETTINGS_PAGINATION_PAGE_SIZE: int({
            default: sharedDefaults.pagination.pageSize,
            min: 1
        })
    }
});
