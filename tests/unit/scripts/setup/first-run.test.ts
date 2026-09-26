/**
 * The property `npm run setup` exists for: a fresh clone's `.env-example`, with every placeholder
 * `fillableKeys` knows about filled in, must actually boot — `assertRequiredConfig` must not
 * throw. Before B11a's `fails()` fix this failed even fully filled, because `NODE_METRICS_TOKEN`'s
 * `minLength: 0` (may stay unset) was unreachable.
 */
import { parse as parseDotenv } from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertRequiredConfig } from '@kernel/required-config';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import { withEnvironmentOverrides, withoutEnvironmentInThisFile } from '@tests/environment';
import { enabledModules } from '../../../../src/modules';
import { APP_NON_MODULE_CHECKS } from '@app/required-config';
import { fillPlaceholders } from '../../../../scripts/setup/environment-file';
import { fillableKeys } from '../../../../scripts/setup/required-keys';

/** Every `requiredConfig` key across the enabled modules and the app-level checks, placeholder or not. */
const everyRequiredKey = (): string[] =>
    [
        ...enabledModules.flatMap((appModule) => appModule.requiredConfig ?? []),
        ...(APP_NON_MODULE_CHECKS.required ?? [])
    ].map(({ key }) => key);

withoutEnvironmentInThisFile(everyRequiredKey());

afterEach(() => enableDemoProfile(false));

describe('.env-example, filled by npm run setup', () => {
    it('boots clean under NODE_ENV=development', async () => {
        const example = readFileSync(path.join(__dirname, '../../../../.env-example'), 'utf8');
        const { content: filled } = fillPlaceholders(example, fillableKeys());
        const parsed = parseDotenv(filled);

        await withEnvironmentOverrides({ ...parsed, NODE_ENV: 'development' }, () => {
            expect(() => assertRequiredConfig(enabledModules, APP_NON_MODULE_CHECKS)).not.toThrow();
            return Promise.resolve();
        });
    });
});
