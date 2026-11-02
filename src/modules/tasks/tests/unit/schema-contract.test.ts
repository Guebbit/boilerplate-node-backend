/**
 * @module
 * The task schema's contract. A contact form is the one place a stranger writes to
 * the database, so what it requires is a decision about who can reach operators at all. The line
 * drawn: "we must be able to reply, and know what about" — email, subject, message required, name
 * optional, since reporting a problem doesn't obligate saying who you are.
 */
import { taskSchema } from '@modules/tasks/model';
import { TaskStatus } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    indexSpecs,
    optionsOf,
    requiredPaths
} from '@tests/schema';
import { currentEnvironment } from '@infrastructure/config/store';

/** The retention window the schema was built with, in seconds. Mirrors the model's own default. */
const RETENTION_SECONDS =
    Number(currentEnvironment().NODE_TASKS_RETENTION_DAYS ?? 730) * 24 * 60 * 60;

describe('taskSchema', () => {
    it('requires a subject, a message and a route set; the address is the form’s rule, not the schema’s', () => {
        // A system task has no sender, so `email` is required by the service for a visitor task
        // only. The route set always exists: a task without a jurisdiction would be nobody's.
        expect(requiredPaths(taskSchema)).toEqual(['message', 'routeSet', 'subject']);
    });

    it('leaves the name optional', () => {
        // Deliberate: someone reporting a problem is not obliged to identify themselves, and a
        // required name is answered with a fake one rather than a real one.
        expect(requiredPaths(taskSchema)).not.toContain('name');
    });

    it('leaves the operator-side fields absent until an operator fills them', () => {
        // `adminNotes` and `respondedAt` are written by the answer, not by the submission. A
        // `default` on `respondedAt` would mark every incoming message as already answered.
        expect(defaultOf(taskSchema, 'respondedAt')).toBeUndefined();
        expect(defaultOf(taskSchema, 'closedAt')).toBeUndefined();
    });

    it('restricts status to the contract enum and starts every request new', () => {
        expect(enumOf(taskSchema, 'status')).toEqual(Object.values(TaskStatus));
        expect(defaultOf(taskSchema, 'status')).toBe(TaskStatus.new);
    });

    it('indexes the operator queue and the retention sweep', () => {
        // The queue — "what is still open, most recent first" — plus the TTL index below.
        expect(indexSpecs(taskSchema)).toEqual([
            'assigneeId_1_status_1: assigneeId+1, status+1',
            'closedAt_1: closedAt+1',
            'email_1: email+1',
            'eventIds_1: eventIds+1',
            'openKey_1: openKey+1',
            'routeSet_1_status_1_dueAt_1: routeSet+1, status+1, dueAt+1',
            'subjectId_1: subjectId+1'
        ]);
    });

    it('keeps timestamps, which the queue is ordered by', () => {
        expect(optionsOf(taskSchema).timestamps).toBe(true);
    });

    it('expires tasks at the configured retention window, and only those', () => {
        // Asserted against the configured window rather than a literal, so changing
        // `NODE_TASKS_RETENTION_DAYS` moves the policy and the test together — and so a TTL
        // appearing on a different index fails here.
        expect(indexOptionSpecs(taskSchema)).toEqual([
            'assigneeId_1_status_1: partialFilterExpression={"assigneeId":{"$exists":true}}',
            `closedAt_1: expireAfterSeconds=${RETENTION_SECONDS}`,
            'email_1: partialFilterExpression={"email":{"$exists":true}}',
            'eventIds_1: partialFilterExpression={"eventIds":{"$exists":true}}',
            'openKey_1: partialFilterExpression={"openKey":{"$exists":true}}, unique=true',
            'routeSet_1_status_1_dueAt_1: (none)',
            'subjectId_1: partialFilterExpression={"subjectId":{"$exists":true}}'
        ]);
    });

    it('expires ascending by closedAt, so an open task never expires', () => {
        // Mongo only honours `expireAfterSeconds` on a single-field ascending index. The same
        // field appears descending in the compound queue index above; getting these confused
        // produces an index that silently never deletes anything.
        expect(indexSpecs(taskSchema)).toContain('closedAt_1: closedAt+1');
    });
});
