import { isPackedRuleOperand, nullPathsIn } from '@tests/response-contract';

describe('nullPathsIn', () => {
    it('finds nothing in a body without null', () => {
        expect(nullPathsIn({ a: 1, b: [{ c: '' }, 0, false], d: {} })).toEqual([]);
    });

    it('names a top-level null by its key', () => {
        expect(nullPathsIn({ a: null })).toEqual(['a']);
    });

    it('names a null inside a free-form object and inside an array', () => {
        expect(nullPathsIn({ items: [{ metadata: { changes: { x: { to: null } } } }] })).toEqual([
            'items.0.metadata.changes.x.to'
        ]);
    });

    it('names a body that is itself null', () => {
        expect(nullPathsIn(null)).toEqual(['(body)']);
    });
});

describe('isPackedRuleOperand', () => {
    const rule = 'tenant.0.2.deletedAt';

    it('allows a null in a rule of the top-level abilities of a refresh', () => {
        expect(isPackedRuleOperand('refreshToken', `abilities.${rule}`)).toBe(true);
    });

    it.each(['login', 'loginTwoFactor', 'loginRestore', 'getAccount'])(
        'allows a null in a rule of account.abilities on %s',
        (operationId) => {
            expect(isPackedRuleOperand(operationId, `account.abilities.${rule}`)).toBe(true);
        }
    );

    it('allows the platform list too', () => {
        expect(isPackedRuleOperand('getAccount', 'abilities.platform.3.2.deletedAt')).toBe(true);
    });

    it('still refuses the same shape in a response that is not a session answer', () => {
        expect(isPackedRuleOperand('listAuditLogs', `items.0.metadata.abilities.${rule}`)).toBe(
            false
        );
        expect(isPackedRuleOperand('listAuditLogs', `abilities.${rule}`)).toBe(false);
    });

    it('refuses a null on any condition field but deletedAt', () => {
        expect(isPackedRuleOperand('login', 'account.abilities.tenant.0.2.userId')).toBe(false);
        expect(isPackedRuleOperand('login', 'account.abilities.tenant.0.2.deletedAt.x')).toBe(
            false
        );
    });

    it('refuses a null outside the conditions of a packed rule, on a session answer', () => {
        expect(isPackedRuleOperand('login', 'account.abilities.grantableRoles.0')).toBe(false);
        expect(isPackedRuleOperand('login', 'account.imageUrl')).toBe(false);
    });
});
