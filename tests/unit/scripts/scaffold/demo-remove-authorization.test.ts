import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    readRemovedAuthorization,
    stripConformanceCases,
    stripRoleGrants
} from '../../../../scripts/scaffold/demo-remove-authorization';

/** A throwaway repo root. */
let root: string;

/** Write a file under the throwaway root, creating its folder. */
const write = (relative: string, content: string): void => {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
};

/** Read a file back from the throwaway root. */
const read = (relative: string): string => readFileSync(path.join(root, relative), 'utf8');

beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'demo-remove-auth-'));
    write(
        'src/modules/orders/authorization.yaml',
        'rules:\n    - action: display\n      subject: Order\n    - action: read\n      subject: Order\n\nsets:\n    - name: OrderDisplay\n      rules:\n          - display:Order\n    - name: OrderOwn\n      rules:\n          - read:Order\n'
    );
    write(
        'src/modules/users/authorization.yaml',
        'rules:\n    - action: read\n      subject: User\n\nsets:\n    - name: UserDisplay\n      rules:\n          - read:User\n'
    );
    write(
        'shared/contracts/authorization-keys.core.yaml',
        'rules:\n    - action: read\n      subject: Translation\n'
    );
    write(
        'shared/authorization-roles.yaml',
        [
            'roles:',
            '    - name: clerk',
            '      sets:',
            '          # a comment between the heading and the items',
            '          - OrderDisplay',
            '    - name: admin',
            '      sets:',
            '          - OrderOwn',
            '          - UserDisplay',
            ''
        ].join('\n')
    );
    write(
        'shared/authorization-conformance.yaml',
        [
            'admin: &admin',
            '    - display:Order',
            '    - read:User',
            '',
            'cases:',
            '    - name: an order is readable',
            '      caller: { id: a, permissions: [display:Order] }',
            '      subject: Order',
            '      expect: allow',
            '',
            '    - name: a user is readable to an admin that also holds order rules',
            '      caller: { id: a, permissions: [display:Order, read:User] }',
            '      subject: User',
            '      expect: allow',
            '',
            '    - name: nothing left to hold',
            '      caller: { id: a, permissions: [display:Order] }',
            '      subject: User',
            '      expect: deny',
            ''
        ].join('\n')
    );
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('the shared authorization files after a module is removed', () => {
    it('reads the removed rules and sets, and only the subjects no survivor still declares', () => {
        const removed = readRemovedAuthorization(root, ['orders']);

        expect([...removed.rules].toSorted()).toEqual(['display:Order', 'read:Order']);
        expect([...removed.sets].toSorted()).toEqual(['OrderDisplay', 'OrderOwn']);
        expect([...removed.subjects]).toEqual(['Order']);
    });

    it('drops the grants from a role, keeping an empty list parseable', () => {
        stripRoleGrants(root, readRemovedAuthorization(root, ['orders']));

        const roles = read('shared/authorization-roles.yaml');
        expect(roles).not.toContain('Order');
        expect(roles).toContain('sets: []');
        expect(roles).toContain('- UserDisplay');
    });

    it('drops cases about the removed subject and cases whose caller held only removed rules', () => {
        stripConformanceCases(root, readRemovedAuthorization(root, ['orders']));

        const conformance = read('shared/authorization-conformance.yaml');
        expect(conformance).not.toContain('an order is readable');
        expect(conformance).not.toContain('nothing left to hold');
        expect(conformance).toContain('permissions: [read:User]');
        expect(conformance).not.toContain('display:Order');
    });
});
