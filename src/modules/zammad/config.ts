/**
 * @module
 * The Zammad hand-over's settings. Everything hangs on `NODE_ZAMMAD_URL`: unset, the module is
 * inert and basic mode (the support mailbox and the contact to-do) is the whole story.
 *
 * @see docs/modules/zammad.md#configuration
 */

import { defineConfig } from '@infrastructure/config/define';
import { int, text } from '@infrastructure/config/fields';

/** Zammad settings: where it is, who we are to it, which group a message lands in, how long it keeps one. */
export const zammadConfig = defineConfig({
    name: 'zammad',
    shape: {
        /** The internal rails address on the `helpdesk` network (never nginx, never the public host). No default: unset means inert. */
        NODE_ZAMMAD_URL: text(),
        /** The integration user's HTTP token. `NODE_ZAMMAD_API_TOKEN_FILE` stands in for it. */
        NODE_ZAMMAD_API_TOKEN: text({ sensitive: true }),
        /** The Zammad group a contact message is filed in. */
        NODE_ZAMMAD_GROUP: text(),
        /** Days a ticket is kept after its last customer contact; read by the retention job. */
        NODE_ZAMMAD_RETENTION_DAYS: int({ default: 730, min: 1 })
    },
    check: (config) =>
        config.NODE_ZAMMAD_URL === undefined
            ? []
            : [
                  ...(URL.canParse(config.NODE_ZAMMAD_URL) ? [] : ['NODE_ZAMMAD_URL is not a URL']),
                  ...(config.NODE_ZAMMAD_API_TOKEN
                      ? []
                      : ['NODE_ZAMMAD_API_TOKEN is required when NODE_ZAMMAD_URL is set']),
                  ...(config.NODE_ZAMMAD_GROUP
                      ? []
                      : ['NODE_ZAMMAD_GROUP is required when NODE_ZAMMAD_URL is set'])
              ]
});

/** What the adapter needs to talk to Zammad, all of it present. */
export interface ZammadSettings {
    /** Base address without a trailing slash. */
    url: string;
    /** The integration user's token. */
    token: string;
    /** The group contact messages are filed in. */
    group: string;
}

/**
 * The settings, or `undefined` while the module is inert (no URL). A set URL with a missing
 * token or group is refused at boot by the slice's `check`, so a half-configured module never
 * gets here.
 */
export const zammadSettings = (): ZammadSettings | undefined => {
    const config = zammadConfig();
    if (config.NODE_ZAMMAD_URL === undefined) return undefined;
    return {
        url: config.NODE_ZAMMAD_URL.replace(/\/+$/, ''),
        // Both are present whenever the URL is: `check` above refuses boot otherwise.
        token: config.NODE_ZAMMAD_API_TOKEN ?? '',
        group: config.NODE_ZAMMAD_GROUP ?? ''
    };
};

/** Whether the module is on: a URL is set. */
export const zammadEnabled = (): boolean => zammadConfig().NODE_ZAMMAD_URL !== undefined;
