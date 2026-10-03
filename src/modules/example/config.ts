/**
 * @module
 * In any module: the environment variables this module reads, declared once, typed and checked at
 * boot. No other file reads `process.env`. Here: the longest body an example may have.
 *
 * See: docs/tools/configuration.md
 */

import { defineConfig } from '@infrastructure/config/define';
import { int } from '@infrastructure/config/fields';

/** The example module's slice of the environment. */
export const exampleConfig = defineConfig({
    name: 'example',
    shape: {
        NODE_EXAMPLE_BODY_MAX_LENGTH: int({
            default: 5000,
            min: 1,
            max: 20_000,
            describe: 'Longest body, in characters, an example may have. The contract allows 20000.'
        })
    }
});
