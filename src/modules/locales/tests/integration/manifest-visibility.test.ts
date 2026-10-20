/**
 * @module
 * Who the manifest offers a switched-off language to. A language with a deployed dictionary file
 * (`src/locales/it.json`) is always among the supported ones, so the scoped read that drops a
 * switched-off ROW is not enough: the file-backed language came back as `active: true`. Every
 * caller now sees it as `active: false`: a client that bundles the language itself needs that row
 * to stop offering it. The sitemap, which lists only the active ones, leaves it out.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { givenLocale } from '../factories';

setupTestDb();

/** The tags `GET /locales` lists for the given bearer, or an anonymous caller. */
const manifestTags = (bearer?: string) => {
    const pending = api().get('/locales');
    return (bearer ? pending.set('Authorization', bearer) : pending).then((response) => {
        expect(response.status).toBe(200);
        return (response.body.data.locales as { tag: string; active: boolean }[]).map(
            ({ tag, active }) => [tag, active] as const
        );
    });
};

describe('GET /locales for a language with a deployed file that is switched off', () => {
    it('lists it as off, for a visitor and for staff alike', async () => {
        await givenLocale('it', { active: false });
        const { bearer } = await authenticateAs('admin');

        const visitor = await manifestTags();
        const staff = await manifestTags(bearer);

        expect(visitor).toContainEqual(['en', true]);
        expect(visitor).toContainEqual(['it', false]);
        expect(staff).toContainEqual(['it', false]);
    });

    it('offers it again to a visitor once it is switched on', async () => {
        await givenLocale('it', { active: false });
        const { bearer } = await authenticateAs('admin');

        const on = await api()
            .patch('/locales/it')
            .set('Authorization', bearer)
            .send({ active: true });

        expect(on.status).toBe(200);
        expect(await manifestTags()).toContainEqual(['it', true]);
    });

    it('still offers a file-backed language that has no row at all', async () => {
        expect(await manifestTags()).toContainEqual(['it', true]);
    });
});
