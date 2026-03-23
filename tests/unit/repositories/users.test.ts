import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Set test environment before imports
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-for-testing-purposes';

import { sequelize } from '../../../src/config/database';
import { User } from '../../../src/models/users';
import { UserRole } from '../../../src/types/index';
import { userRepository } from '../../../src/repositories/users';

// Import orders to set up associations
import '../../../src/models/orders';

describe('userRepository', () => {
  beforeAll(async () => {
    await sequelize.sync({ force: true });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  beforeEach(async () => {
    await User.destroy({ where: {}, truncate: true });
  });

  const makeUser = (overrides = {}) => ({
    email: `test-${Date.now()}-${Math.random()}@example.com`,
    password: 'Password123!',
    username: 'testuser',
    role: UserRole.USER,
    ...overrides,
  });

  // ─── findById ─────────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns a user when found', async () => {
      const created = await User.create(makeUser());
      const found = await userRepository.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('returns null when not found', async () => {
      const found = await userRepository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ─── findByEmail ──────────────────────────────────────────────────────────────

  describe('findByEmail', () => {
    it('returns a user when found by email', async () => {
      const data = makeUser({ email: 'findme@example.com' });
      await User.create(data);
      const found = await userRepository.findByEmail('findme@example.com');
      expect(found).not.toBeNull();
      expect(found?.email).toBe('findme@example.com');
    });

    it('returns null when email not found', async () => {
      const found = await userRepository.findByEmail('notexist@example.com');
      expect(found).toBeNull();
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated users', async () => {
      await User.create(makeUser({ email: 'a@example.com', username: 'alice' }));
      await User.create(makeUser({ email: 'b@example.com', username: 'bob' }));

      const result = await userRepository.findAll({ page: 1, limit: 10 });
      expect(result.rows.length).toBe(2);
      expect(result.meta.total).toBe(2);
      expect(result.meta.totalPages).toBe(1);
    });

    it('filters by email', async () => {
      await User.create(makeUser({ email: 'filter-email@example.com', username: 'filteremail' }));
      await User.create(makeUser({ email: 'other@example.com', username: 'other' }));

      const result = await userRepository.findAll({ page: 1, limit: 10, email: 'filter-email' });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].email).toBe('filter-email@example.com');
    });

    it('filters by username', async () => {
      await User.create(makeUser({ email: 'u1@example.com', username: 'uniqueuser123' }));
      await User.create(makeUser({ email: 'u2@example.com', username: 'anotheruser' }));

      const result = await userRepository.findAll({ page: 1, limit: 10, username: 'uniqueuser123' });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].username).toBe('uniqueuser123');
    });

    it('filters by role', async () => {
      await User.create(makeUser({ email: 'admin1@example.com', username: 'adminuser', role: UserRole.ADMIN }));
      await User.create(makeUser({ email: 'user1@example.com', username: 'normaluser', role: UserRole.USER }));

      const result = await userRepository.findAll({ page: 1, limit: 10, role: UserRole.ADMIN });
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].role).toBe(UserRole.ADMIN);
    });

    it('respects pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await User.create(makeUser({ email: `page-user-${i}@example.com`, username: `puser${i}` }));
      }

      const page1 = await userRepository.findAll({ page: 1, limit: 3 });
      expect(page1.rows.length).toBe(3);
      expect(page1.meta.total).toBe(5);
      expect(page1.meta.totalPages).toBe(2);

      const page2 = await userRepository.findAll({ page: 2, limit: 3 });
      expect(page2.rows.length).toBe(2);
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a user and hashes the password', async () => {
      const data = makeUser({ email: 'create@example.com', username: 'createuser' });
      const user = await userRepository.create(data);

      expect(user.id).toBeDefined();
      expect(user.email).toBe('create@example.com');
      expect(user.password).not.toBe(data.password); // Password should be hashed
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates a user and returns the updated record', async () => {
      const user = await User.create(makeUser({ email: 'update@example.com', username: 'beforeupdate' }));
      const updated = await userRepository.update(user.id, { username: 'afterupdate' });

      expect(updated).not.toBeNull();
      expect(updated?.username).toBe('afterupdate');
    });

    it('returns null when user not found', async () => {
      const result = await userRepository.update('00000000-0000-0000-0000-000000000000', { username: 'x' });
      expect(result).toBeNull();
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a user and returns true', async () => {
      const user = await User.create(makeUser({ email: 'delete@example.com' }));
      const result = await userRepository.remove(user.id);

      expect(result).toBe(true);
      expect(await User.findByPk(user.id)).toBeNull();
    });

    it('returns false when user not found', async () => {
      const result = await userRepository.remove('00000000-0000-0000-0000-000000000000');
      expect(result).toBe(false);
    });
  });
});
