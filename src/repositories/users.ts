import { Op, WhereOptions } from 'sequelize';
import { User } from '../models/users';
import type { CreateUserInput, UpdateUserInput, SearchUserInput } from '../models/users';
import type { PaginationMeta } from '../types/index';

// ─── User Repository ──────────────────────────────────────────────────────────

export interface FindAllUsersResult {
  rows: User[];
  meta: PaginationMeta;
}

export const userRepository = {
  async findById(id: string): Promise<User | null> {
    return User.findByPk(id);
  },

  async findByEmail(email: string): Promise<User | null> {
    return User.findOne({ where: { email } });
  },

  async findAll(filters: SearchUserInput): Promise<FindAllUsersResult> {
    const { page, limit, email, username, role } = filters;
    // Defensive clamp: Zod schemas enforce min(1), but guard against misuse
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const offset = (safePage - 1) * safeLimit;

    const where: WhereOptions = {};
    if (email) where['email'] = { [Op.like]: `%${email}%` };
    if (username) where['username'] = { [Op.like]: `%${username}%` };
    if (role) where['role'] = role;

    const { rows, count } = await User.findAndCountAll({
      where,
      limit: safeLimit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      rows,
      meta: {
        total: count,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(count / safeLimit),
      },
    };
  },

  async create(data: CreateUserInput): Promise<User> {
    return User.create(data);
  },

  async update(id: string, data: UpdateUserInput): Promise<User | null> {
    const user = await User.findByPk(id);
    if (!user) return null;
    return user.update(data);
  },

  async remove(id: string): Promise<boolean> {
    const deleted = await User.destroy({ where: { id } });
    return deleted > 0;
  },
};
