/*
 * Collapses `users.analyticsConsent` from the `'granted' | 'denied'` string enum to a boolean.
 * The gate already treated `'denied'` and absent identically (`emitAnalyticsEvent`, since
 * `43a9103b`), so this is a type change with no behavioural difference for any existing account:
 * only `'granted'` ever captured, and only `true` does now.
 *
 * `'granted'` -> true, `'denied'` -> false, absent -> false — the schema's own new default.
 */
module.exports = {
    async up(db) {
        await db
            .collection('users')
            .updateMany({ analyticsConsent: 'granted' }, { $set: { analyticsConsent: true } });
        await db
            .collection('users')
            .updateMany(
                { analyticsConsent: { $in: ['denied', null] } },
                { $set: { analyticsConsent: false } }
            );
        await db
            .collection('users')
            .updateMany(
                { analyticsConsent: { $exists: false } },
                { $set: { analyticsConsent: false } }
            );
    },

    async down(db) {
        /*
         * Best-effort inverse, not a true restore: `'denied'` and "never asked" both collapsed to
         * `false` above, and which one a row used to be is gone. Every `false` comes back as
         * `'denied'` — the same reading the gate already gave both, so nothing downstream can
         * tell the difference.
         */
        await db
            .collection('users')
            .updateMany({ analyticsConsent: true }, { $set: { analyticsConsent: 'granted' } });
        await db
            .collection('users')
            .updateMany({ analyticsConsent: false }, { $set: { analyticsConsent: 'denied' } });
    }
};
