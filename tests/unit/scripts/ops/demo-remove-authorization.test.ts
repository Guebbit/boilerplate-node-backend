import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    readRemovedAuthorization,
    stripConformanceCases,
    stripRoleGrants
} from '../../../../scripts/ops/demo-remove-authorization';

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
        'keys:\n    - key: orders.any.read\n      subject: Order\n    - key: orders.self.read\n      subject: Order\n'
    );
    write(
        'src/modules/users/authorization.yaml',
        'keys:\n    - key: users.any.read\n      subject: User\n'
    );
    write(
        'shared/contracts/authorization-keys.core.yaml',
        'keys:\n    - key: translations.any.read\n      subject: Translation\n'
    );
    write(
        'shared/authorization-roles.yaml',
        [
            'roles:',
            '    - name: clerk',
            '      permissions:',
            '          # a comment between the heading and the items',
            '          - orders.any.read',
            '    - name: admin',
            '      permissions:',
            '          - orders.self.read',
            '          - users.any.read',
            ''
        ].join('\n')
    );
    write(
        'shared/authorization-conformance.yaml',
        [
            'admin: &admin',
            '    - orders.any.read',
            '    - users.any.read',
            '',
            'cases:',
            '    - name: an order is readable',
            '      caller: { id: a, permissions: [orders.any.read] }',
            '      subject: Order',
            '      expect: allow',
            '',
            '    - name: a user is readable to an admin that also holds order keys',
            '      caller: { id: a, permissions: [orders.any.read, users.any.read] }',
            '      subject: User',
            '      expect: allow',
            '',
            '    - name: nothing left to hold',
            '      caller: { id: a, permissions: [orders.any.read] }',
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
    it('reads the removed keys, and only the subjects no survivor still declares', () => {
        const removed = readRemovedAuthorization(root, ['orders']);

        expect([...removed.keys].toSorted()).toEqual(['orders.any.read', 'orders.self.read']);
        expect([...removed.subjects]).toEqual(['Order']);
    });

    it('drops the grants from a role, keeping an empty list parseable', () => {
        stripRoleGrants(root, readRemovedAuthorization(root, ['orders']));

        const roles = read('shared/authorization-roles.yaml');
        expect(roles).not.toContain('orders.');
        expect(roles).toContain('permissions: []');
        expect(roles).toContain('- users.any.read');
    });

    it('drops cases about the removed subject and cases whose caller held only removed keys', () => {
        stripConformanceCases(root, readRemovedAuthorization(root, ['orders']));

        const conformance = read('shared/authorization-conformance.yaml');
        expect(conformance).not.toContain('an order is readable');
        expect(conformance).not.toContain('nothing left to hold');
        expect(conformance).toContain('permissions: [users.any.read]');
        expect(conformance).not.toContain('orders.any.read');
    });
});
