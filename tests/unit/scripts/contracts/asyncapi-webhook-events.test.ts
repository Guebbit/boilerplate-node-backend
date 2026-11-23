import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { MODULES_ROOT, modulesWith } from '../../../../scripts/modules-on-disk';
import {
    webhookEventFragments,
    webhookEventNames
} from '../../../../scripts/contracts/asyncapi-webhook-events';

describe('webhookEventFragments', () => {
    it('finds every module that ships a fragment', () => {
        const owners = webhookEventFragments().map((file) => file.split('/').at(-2));

        expect(owners.toSorted()).toEqual(modulesWith(MODULES_ROOT, 'asyncapi.webhooks.yaml'));
    });
});

describe('webhookEventNames', () => {
    it('lists the channels of every fragment once, in fragment order', () => {
        const names = webhookEventNames();
        const [first] = webhookEventFragments();
        const firstChannels = Object.keys(
            (parseYaml(readFileSync(first, 'utf8')) as { channels: object }).channels
        );

        expect(names.slice(0, firstChannels.length)).toEqual(firstChannels);
        expect(new Set(names).size).toBe(names.length);
        expect(names).toContain('user.erased');
    });
});
