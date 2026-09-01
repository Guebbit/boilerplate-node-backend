const { createHash } = require('node:crypto');

/*
 * Hash every stored token value in place — BETTER_SECURITY.md wave 3.1.
 *
 * `users.tokens[].token` held live refresh JWTs, password-reset tokens and delete-confirmation
 * tokens IN THE CLEAR. `select: false` on the schema keeps them off ordinary reads, which is not
 * the same as protecting them: one read-only exposure of this collection is takeover of every
 * account at once, no cracking involved.
 *
 * A plain sha256 digest, matching `hashToken` in `src/modules/users/model.ts` exactly — every
 * value here already carries 128 bits of entropy from `randomBytes(16)` or a signed JWT, so there
 * is no low-entropy secret to stretch, and bcrypt would only slow the refresh path every
 * authenticated client hits on a timer.
 *
 * Hashed IN PLACE, not dropped: the plaintext is the input the hash needs, so this is the one
 * chance to migrate it rather than a decision to sign everyone out. Idempotent by inspection —
 * a value already shaped like a 64-character hex digest is left alone — so re-running against an
 * already-migrated database, or one where some rows were written after the code deploy and are
 * already hashed, is a no-op for those rows.
 *
 * NOT a declarative `updateMany`: the replacement value has to be COMPUTED per token, which Mongo's
 * update operators cannot express, so this walks a cursor and writes one document at a time.
 */

const HEX64 = /^[\da-f]{64}$/;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

module.exports = {
    async up(db) {
        const cursor = db
            .collection('users')
            .find({ 'tokens.0': { $exists: true } }, { projection: { tokens: 1 } });

        while (await cursor.hasNext()) {
            const user = await cursor.next();
            const tokens = user.tokens.map((entry) =>
                HEX64.test(entry.token) ? entry : { ...entry, token: hashToken(entry.token) }
            );
            await db.collection('users').updateOne({ _id: user._id }, { $set: { tokens } });
        }
    },

    async down() {
        /*
         * NOT REVERSIBLE. A sha256 digest cannot be turned back into the token it hashed — see
         * BETTER_SECURITY.md "Things that will bite: hashing tokens is a one-way migration". The
         * down migration can only truncate every stored token, which signs everyone out; that is
         * not something to do silently as a side effect of `migrate-mongo down`.
         */
        throw new Error(
            'This migration cannot be rolled back: hashing tokens is one-way. ' +
                'To revert by hand, truncate every users.tokens array ($set: { tokens: [] }) ' +
                '— this signs every account out, on every device.'
        );
    }
};
