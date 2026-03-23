import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-secret-key-for-testing-purposes';

// Mock the repository module
vi.mock('../../../src/repositories/users', () => ({
  userRepository: {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

import { userRepository } from '../../../src/repositories/users';
import { userService, AppError } from '../../../src/services/users';
import { UserRole } from '../../../src/types/index';

// Typed mock helpers
const mockRepo = userRepository as {
  findById: ReturnType<typeof vi.fn>;
  findByEmail: ReturnType<typeof vi.fn>;
  findAll: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

// A factory for mock user objects
const makeMockUser = (overrides = {}) => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  username: 'testuser',
  role: UserRole.USER,
  password: 'hashedpassword',
  comparePassword: vi.fn().mockResolvedValue(true),
  toSafeJSON: vi.fn().mockReturnValue({ id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com', username: 'testuser', role: UserRole.USER }),
  ...overrides,
});

describe('userService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── login ────────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('returns a token and user on success', async () => {
      const mockUser = makeMockUser();
      mockRepo.findByEmail.mockResolvedValue(mockUser);

      const result = await userService.login('test@example.com', 'password123');
      expect(result.token).toBeDefined();
      expect(result.user).toBe(mockUser);
    });

    it('throws 401 when user not found', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);

      await expect(userService.login('notfound@example.com', 'password')).rejects.toThrow(AppError);
      await expect(userService.login('notfound@example.com', 'password')).rejects.toMatchObject({ statusCode: 401 });
    });

    it('throws 401 when password is wrong', async () => {
      const mockUser = makeMockUser({ comparePassword: vi.fn().mockResolvedValue(false) });
      mockRepo.findByEmail.mockResolvedValue(mockUser);

      await expect(userService.login('test@example.com', 'wrongpassword')).rejects.toThrow(AppError);
      await expect(userService.login('test@example.com', 'wrongpassword')).rejects.toMatchObject({ statusCode: 401 });
    });
  });

  // ─── register ─────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates and returns a new user', async () => {
      const mockUser = makeMockUser();
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUser);

      const result = await userService.register({
        email: 'new@example.com',
        password: 'password123',
        username: 'newuser',
        role: UserRole.USER,
      });
      expect(result).toBe(mockUser);
      expect(mockRepo.create).toHaveBeenCalledOnce();
    });

    it('throws 409 when email already in use', async () => {
      mockRepo.findByEmail.mockResolvedValue(makeMockUser());

      await expect(userService.register({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        role: UserRole.USER,
      })).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ─── getById ──────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the user when found', async () => {
      const mockUser = makeMockUser();
      mockRepo.findById.mockResolvedValue(mockUser);

      const result = await userService.getById('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toBe(mockUser);
    });

    it('throws 404 when user not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(userService.getById('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  // ─── search ───────────────────────────────────────────────────────────────────

  describe('search', () => {
    it('returns paginated results from repository', async () => {
      const mockResult = { rows: [makeMockUser()], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await userService.search({ page: 1, limit: 20 });
      expect(result).toBe(mockResult);
      expect(mockRepo.findAll).toHaveBeenCalledOnce();
    });
  });

  // ─── adminCreate ──────────────────────────────────────────────────────────────

  describe('adminCreate', () => {
    it('creates and returns a new user', async () => {
      const mockUser = makeMockUser({ role: UserRole.ADMIN });
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockUser);

      const result = await userService.adminCreate({
        email: 'admin@example.com',
        password: 'password123',
        username: 'adminuser',
        role: UserRole.ADMIN,
      });
      expect(result).toBe(mockUser);
    });

    it('throws 409 when email already in use', async () => {
      mockRepo.findByEmail.mockResolvedValue(makeMockUser());

      await expect(userService.adminCreate({
        email: 'test@example.com',
        password: 'password123',
        username: 'x',
        role: UserRole.USER,
      })).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ─── adminUpdate ──────────────────────────────────────────────────────────────

  describe('adminUpdate', () => {
    it('updates and returns the user', async () => {
      const mockUser = makeMockUser({ username: 'updateduser' });
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.update.mockResolvedValue(mockUser);

      const result = await userService.adminUpdate('550e8400-e29b-41d4-a716-446655440000', { username: 'updateduser' });
      expect(result.username).toBe('updateduser');
    });

    it('throws 404 when user not found', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.update.mockResolvedValue(null);

      await expect(userService.adminUpdate('00000000-0000-0000-0000-000000000000', { username: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('throws 409 when email conflicts with another user', async () => {
      const conflictUser = makeMockUser({ id: '99999999-9999-9999-9999-999999999999' });
      mockRepo.findByEmail.mockResolvedValue(conflictUser);

      await expect(userService.adminUpdate('550e8400-e29b-41d4-a716-446655440000', {
        email: 'conflict@example.com',
      })).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  // ─── remove ───────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes the user successfully', async () => {
      mockRepo.remove.mockResolvedValue(true);
      await expect(userService.remove('550e8400-e29b-41d4-a716-446655440000')).resolves.not.toThrow();
    });

    it('throws 404 when user not found', async () => {
      mockRepo.remove.mockResolvedValue(false);
      await expect(userService.remove('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({ statusCode: 404 });
    });
  });
});
