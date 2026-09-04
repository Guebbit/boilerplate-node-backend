/*
 * Fold the single-TOTP columns into the `twoFactorMethods` array.
 *
 * The account used to hold exactly one second factor, spread over three top-level paths
 * (`twoFactorSecret`, `twoFactorLastUsedStep`, and `twoFactorEnabledAt` doing double duty as both
 * "TOTP is armed" and "2FA is on"). It now holds a list, one entry per method, so that an email
 * code and an authenticator app can be armed side by side — see `docs/tools/security.md`.
 *
 * `twoFactorEnabledAt` STAYS, narrowed to its account-level meaning alone: it is the only 2FA
 * field on the `User` contract, and `postLogin` branches on it without loading credentials.
 *
 * Idempotent by inspection: a document that already has a `twoFactorMethods` array is skipped, so
 * re-running against a partly-migrated database is a no-op for the rows already done.
 *
 * Declarative rather than a cursor walk: every value moves unchanged, which Mongo's own update
 * pipeline can express — unlike the token hashing migration, where the replacement had to be
 * computed per row.
 */

module.exports = {
    async up(db) {
        await db
            .collection('users')
            .updateMany(
                { twoFactorSecret: { $exists: true }, twoFactorMethods: { $exists: false } },
                [
                    {
                        $set: {
                            twoFactorMethods: [
                                {
                                    method: 'totp',
                                    secret: '$twoFactorSecret',
                                    // `$ifNull` rather than a bare reference: an absent path would
                                    // otherwise write the field as missing, which is right, but an
                                    // explicitly-null one would write null, which the schema rejects.
                                    enrolledAt: { $ifNull: ['$twoFactorEnabledAt', '$$REMOVE'] },
                                    lastUsedStep: {
                                        $ifNull: ['$twoFactorLastUsedStep', '$$REMOVE']
                                    }
                                }
                            ]
                        }
                    },
                    { $unset: ['twoFactorSecret', 'twoFactorLastUsedStep'] }
                ]
            );

        // An account that never enrolled still needs the array to exist, so a later `$push`
        // has something to push onto rather than creating the path implicitly.
        await db
            .collection('users')
            .updateMany(
                { twoFactorMethods: { $exists: false } },
                { $set: { twoFactorMethods: [] } }
            );
    },

    async down(db) {
        await db.collection('users').updateMany({ 'twoFactorMethods.0': { $exists: true } }, [
            {
                $set: {
                    // Only a TOTP entry can go back: the old shape had nowhere to put an email
                    // factor, so one is dropped rather than silently rewritten as an authenticator.
                    twoFactorSecret: {
                        $let: {
                            vars: {
                                totp: {
                                    $first: {
                                        $filter: {
                                            input: '$twoFactorMethods',
                                            cond: { $eq: ['$$this.method', 'totp'] }
                                        }
                                    }
                                }
                            },
                            in: { $ifNull: ['$$totp.secret', '$$REMOVE'] }
                        }
                    }
                }
            },
            { $unset: 'twoFactorMethods' }
        ]);
    }
};
