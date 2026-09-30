/**
 * @module
 * Persistence configuration: the default page size and the lease collection's retention.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** Paging and job leases. */
export const persistenceConfig = defineConfig({
    name: 'persistence',
    shape: {
        NODE_SETTINGS_PAGINATION_PAGE_SIZE: int({
            default: 10,
            min: 1,
            describe: 'Page size when the caller asks for none. Capped at 100.'
        }),
        NODE_LEASE_RETENTION_DAYS: int({
            default: 30,
            min: 1,
            describe: 'Days an untouched job-lease document survives. Changing it needs `db:sync`.'
        })
    }
});
