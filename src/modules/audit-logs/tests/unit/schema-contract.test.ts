/**
 * @module
 * The audit-log schema's contract.
 *
 * This is the one collection in the system whose schema is a compliance artifact rather than a
 * convenience, and three of its declarations are unlike every other model here:
 *
 *   - `timestamps: false`, with an explicit REQUIRED `timestamp` field instead. An audit entry is
 *     stamped when the event happened, by the emitter, not when the row was written by whatever
 *     drained the queue. Turning Mongoose's timestamps back on would add a second, subtly
 *     different time and invite a reader to pick the wrong one.
 *   - `bufferCommands: false`. If the database is unreachable, an audit write must FAIL rather
 *     than sit in a buffer waiting: the caller's fallback is to log the entry where it will at
 *     least be collected, and a silent buffer that resolves later removes the signal that the
 *     fallback was needed.
 *   - a TTL index on `timestamp`. This is the only place in the codebase where documents are
 *     deleted by the database, and it is the retention policy — so it is asserted against the
 *     configured window rather than against a hardcoded number.
 */

import { auditLogSchema } from '@modules/audit-logs/model';
import { enumOf, indexOptionSpecs, indexSpecs, optionsOf, requiredPaths } from '@tests/schema';

/** The retention window the schema was built with, in seconds. Mirrors the model's own default. */
const RETENTION_SECONDS = Number(process.env.NODE_AUDIT_RETENTION_DAYS ?? 90) * 24 * 60 * 60;

describe('auditLogSchema — what an entry must carry', () => {
    it('requires who, what, how it went, when and at what level', () => {
        // The five that make an entry answerable. Everything else — ip, user agent, request and
        // trace ids, the target, the metadata — enriches an entry that is already complete, and
        // is absent on events that genuinely have none (a scheduled job has no IP).
        expect(requiredPaths(auditLogSchema)).toEqual([
            'action',
            'actor_role',
            'actor_user_id',
            'level',
            'outcome',
            'timestamp'
        ]);
    });

    it('restricts the role, the outcome and the level to closed sets', () => {
        // These three are queried and aggregated on. A free-form value would not error; it would
        // quietly fall outside every filter an operator writes, which is indistinguishable from
        // the event never happening.
        expect(enumOf(auditLogSchema, 'actor_role')).toEqual(['admin', 'user', 'anonymous']);
        expect(enumOf(auditLogSchema, 'outcome')).toEqual(['success', 'failure']);
        expect(enumOf(auditLogSchema, 'level')).toEqual(['info', 'warn']);
    });

    it('includes anonymous as a role, so an unauthenticated event is still attributable', () => {
        // A failed login has no user. Without this value the entry that matters most — the one
        // before an account is taken — has nowhere to record who it was not.
        expect(enumOf(auditLogSchema, 'actor_role')).toContain('anonymous');
    });
});

describe('auditLogSchema — options', () => {
    it('stamps entries from the event, not from the write', () => {
        // `timestamps: false` and a required `timestamp`. The row is written by whatever drained
        // the queue, which can be seconds or a restart later; the entry is about when it happened.
        expect(optionsOf(auditLogSchema).timestamps).toBe(false);
        expect(requiredPaths(auditLogSchema)).toContain('timestamp');
    });

    it('fails an audit write outright rather than buffering it', () => {
        // The caller's fallback is to log the entry where it will at least be collected, and it
        // can only take that path if the write rejects. A buffer that resolves later removes the
        // signal — `auditSinkFailuresTotal` counts exactly this — and the entry is lost silently.
        expect(optionsOf(auditLogSchema).bufferCommands).toBe(false);
    });
});

describe('auditLogSchema — indexes and retention', () => {
    it('indexes the two questions an operator asks, newest first', () => {
        // "What did this account do" and "who did this action" — both read latest-first, which is
        // what the `-1` buys. The third index is the retention sweep below.
        expect(indexSpecs(auditLogSchema)).toEqual([
            'action_1_timestamp_-1: action+1, timestamp-1',
            'actor_user_id_1_timestamp_-1: actor_user_id+1, timestamp-1',
            'timestamp_1: timestamp+1'
        ]);
    });

    it('expires entries at the configured retention window, and only those', () => {
        // The one place documents are deleted by the database. Asserted against the configured
        // window rather than a literal, so changing `NODE_AUDIT_RETENTION_DAYS` moves the policy
        // and the test together — and so a TTL appearing on a different index fails here.
        expect(indexOptionSpecs(auditLogSchema)).toEqual([
            'action_1_timestamp_-1: (none)',
            'actor_user_id_1_timestamp_-1: (none)',
            `timestamp_1: expireAfterSeconds=${RETENTION_SECONDS}`
        ]);
    });

    it('expires ascending by timestamp, which is the direction a TTL index needs', () => {
        // Mongo only honours `expireAfterSeconds` on a single-field ascending index. The same
        // field appears descending in the two compound indexes above; getting these confused
        // produces an index that silently never deletes anything.
        expect(indexSpecs(auditLogSchema)).toContain('timestamp_1: timestamp+1');
    });
});
