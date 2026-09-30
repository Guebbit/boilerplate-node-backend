/**
 * The property `npm run setup` exists for: a fresh clone's `.env-example`, with every placeholder
 * `fillableKeys` knows about filled in, must actually boot — `assertModuleConfig` must not
 * throw. `NODE_METRICS_TOKEN`'s `minLength: 0` (may stay unset) must not count as missing.
 */
import { parse as parseDotenv } from 'dotenv';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { assertModuleConfig } from '@kernel/module-config';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import { withEnvironmentOverrides, withoutEnvironmentInThisFile } from '@tests/environment';
import { enabledModules } from '../../../../src/modules';
import { APP_CONFIG_SLICES, allConfigSlices } from '@app/config';
import { fillPlaceholders } from '../../../../scripts/setup/environment-file';
import { fillableKeys } from '../../../../scripts/setup/required-keys';

/** Every variable with a presence rule across the enabled modules and the app tier, placeholder or not. */
const everyRequiredKey = (): string[] =>
    allConfigSlices(enabledModules).flatMap((slice) =>
        slice.fields.filter(({ presence }) => presence !== undefined).map(({ name }) => name)
    );

withoutEnvironmentInThisFile(everyRequiredKey());

afterEach(() => enableDemoProfile(false));

describe('.env-example, filled by npm run setup', () => {
    it('boots clean under NODE_ENV=development', async () => {
        const example = readFileSync(path.join(__dirname, '../../../../.env-example'), 'utf8');
        const { content: filled } = fillPlaceholders(example, fillableKeys());
        const parsed = parseDotenv(filled);

        await withEnvironmentOverrides({ ...parsed, NODE_ENV: 'development' }, () => {
            expect(() => assertModuleConfig(enabledModules, APP_CONFIG_SLICES)).not.toThrow();
            return Promise.resolve();
        });
    });
});
