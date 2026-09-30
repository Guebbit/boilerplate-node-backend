/**
 * @module
 * Setup the locales contract suites share: registering a language through the real route.
 */

import { api } from '@tests/http';

/** The language every case below registers, unless it says otherwise. */
export const PORTUGUESE = { tag: 'pt', name: 'Portuguese', nativeName: 'Português' };

/** Registers a language through the real route and returns its tag. */
export const createLanguage = async (
    bearer: string,
    body: Record<string, unknown> = PORTUGUESE
) => {
    const response = await api().post('/locales').set('Authorization', bearer).send(body);

    if (response.status !== 201)
        throw new Error(
            `locale setup failed: POST /locales returned ${response.status} — ` +
                JSON.stringify(response.body)
        );

    return response.body.data.tag as string;
};
