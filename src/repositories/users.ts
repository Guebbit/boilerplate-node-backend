/* eslint-disable unicorn/no-negated-condition */
/* eslint-disable unicorn/no-null */
import { Op, type WhereOptions } from 'sequelize';
import { userModel } from '@models/users';
import type { IUserDocument, IUserListItem, UserModel } from '@models/users';
import { cartItemModel } from '@models/cart-items';
import { userTokenModel } from '@models/user-tokens';

type UserWhere = Record<string, unknown>;

/**
 * Converts where.
 *
 * @param where - Filter conditions used to query records.
 */
const toWhere = (where: UserWhere = {}): WhereOptions => {
    const output: Record<string, unknown> = {};

    if (where.id !== undefined) output['id'] = Number(where.id);
    if (where.email !== undefined && typeof where.email !== 'object') output['email'] = where.email;
    if (where.username !== undefined && typeof where.username !== 'object')
        output['username'] = where.username;
    if (where.admin !== undefined) output['admin'] = where.admin;

    if (where.deletedAt === null) {
        output['deletedAt'] = null;
    } else if (typeof where.deletedAt === 'object') {
        const condition = where.deletedAt as Record<string, unknown>;
        if (condition.exists === false) output['deletedAt'] = null;
        if (condition.exists === true) output['deletedAt'] = { [Op.not]: null };
    } else if (where.deletedAt !== undefined) {
        output['deletedAt'] = where.deletedAt;
    }

    if (typeof where.email === 'object') {
        const contains = (where.email as Record<string, unknown>).contains;
        if (contains !== undefined) output['email'] = { [Op.like]: `%${String(contains)}%` };
    }

    if (typeof where.username === 'object') {
        const contains = (where.username as Record<string, unknown>).contains;
        if (contains !== undefined) output['username'] = { [Op.like]: `%${String(contains)}%` };
    }

    const conditions = where.or as Array<Record<string, unknown>> | undefined;
    if (conditions && conditions.length > 0) {
        (output as Record<symbol, unknown>)[Op.or] = conditions
            .map((condition) => {
                if (condition.email && typeof condition.email === 'object') {
                    const contains = (condition.email as Record<string, unknown>).contains;
                    return { email: { [Op.like]: `%${String(contains)}%` } };
                }
                if (condition.username && typeof condition.username === 'object') {
                    const contains = (condition.username as Record<string, unknown>).contains;
                    return { username: { [Op.like]: `%${String(contains)}%` } };
                }
                return;
            })
            .filter(Boolean);
    }

    return output;
};

/**
 * Runs token filter.
 *
 * @param where - Filter conditions used to query records.
 */
const tokenFilter = (where: UserWhere) => {
    const token = where['tokens.token'];
    const type = where['tokens.type'];

    if (token === undefined && type === undefined) return;
    return {
        model: userTokenModel,
        as: 'tokens',
        required: true,
        where: {
            ...(token !== undefined ? { token } : {}),
            ...(type !== undefined ? { type } : {})
        }
    };
};

/**
 * Runs with computed relations.
 *
 * @param user - User document used to scope the operation.
 */
const withComputedRelations = (
    user: UserModel | IUserDocument | null
): Promise<IUserDocument | null> => {
    if (!user) return Promise.resolve(null);
    const hydratedUser = user as IUserDocument;

    return Promise.all([
        userTokenModel.findAll({
            where: { userId: hydratedUser.id },
            raw: true
        }),
        cartItemModel.findAll({
            where: { userId: hydratedUser.id },
            raw: true
        })
    ]).then(([tokens, cartItems]) => {
        hydratedUser.tokens = tokens.map((token) => ({
            type: token.type,
            token: token.token,
            expiration: token.expiration ? new Date(token.expiration) : undefined
        }));

        if (hydratedUser.deletedAt === null) hydratedUser.deletedAt = undefined;

        hydratedUser.cart = {
            items: cartItems.map((item) => ({ product: item.productId, quantity: item.quantity })),
            updatedAt: hydratedUser.cartUpdatedAt
        };

        return hydratedUser;
    });
};

/**
 * Finds by id.
 *
 * @param id - Resource identifier.
 */
export const findById = (id: string | number): Promise<IUserDocument | null> =>
    userModel.findByPk(Number(id)).then((user) => withComputedRelations(user));

/**
 * Finds one.
 *
 * @param where - Filter conditions used to query records.
 */
export const findOne = (where: UserWhere): Promise<IUserDocument | null> => {
    const includeToken = tokenFilter(where);
    return userModel
        .findOne({
            where: toWhere(where),
            include: includeToken ? [includeToken as never] : undefined
        })
        .then((user) => withComputedRelations(user));
};

/**
 * Finds all.
 *
 * @param where - Filter conditions used to query records.
 * @param options - Additional options for the operation.
 */
export const findAll = (
    where: UserWhere = {},
    {
        sort = { createdAt: -1 as const },
        skip = 0,
        limit = 10
    }: {
        sort?: Record<string, 1 | -1>;
        skip?: number;
        limit?: number;
    } = {}
): Promise<IUserListItem[]> => {
    const [sortField, sortDirection] = Object.entries(sort)[0] ?? ['createdAt', -1];
    return userModel
        .findAll({
            where: toWhere(where),
            order: [[sortField, sortDirection === -1 ? 'DESC' : 'ASC']],
            offset: skip,
            limit
        })
        .then((rows) => {
            const userRows = rows.map((row) => row.get({ plain: true })) as Array<
                IUserListItem & { cartUpdatedAt: Date; deletedAt?: Date | null }
            >;
            const userIds = userRows.map((row) => Number(row.id));

            if (userIds.length === 0) return [] as IUserListItem[];

            return Promise.all([
                userTokenModel.findAll({
                    where: { userId: { [Op.in]: userIds } },
                    raw: true
                }),
                cartItemModel.findAll({
                    where: { userId: { [Op.in]: userIds } },
                    raw: true
                })
            ]).then(([tokens, cartItems]) => {
                const tokensByUser = new Map<number, IUserListItem['tokens']>();
                for (const token of tokens) {
                    const key = Number(token.userId);
                    const list = tokensByUser.get(key) ?? [];
                    list.push({
                        type: token.type,
                        token: token.token,
                        expiration: token.expiration ? new Date(token.expiration) : undefined
                    });
                    tokensByUser.set(key, list);
                }

                const cartItemsByUser = new Map<number, IUserListItem['cart']['items']>();
                for (const item of cartItems) {
                    const key = Number(item.userId);
                    const list = cartItemsByUser.get(key) ?? [];
                    list.push({ product: item.productId, quantity: item.quantity });
                    cartItemsByUser.set(key, list);
                }

                return userRows.map((row) => ({
                    ...row,
                    deletedAt: row.deletedAt === null ? undefined : row.deletedAt,
                    cart: {
                        items: cartItemsByUser.get(Number(row.id)) ?? [],
                        updatedAt: row.cartUpdatedAt
                    },
                    tokens: tokensByUser.get(Number(row.id)) ?? []
                }));
            });
        });
};

/**
 * Counts records.
 *
 * @param where - Filter conditions used to query records.
 */
export const count = (where: UserWhere = {}): Promise<number> =>
    userModel.count({ where: toWhere(where) });

/**
 * Creates a record.
 *
 * @param data - Payload containing values to create or update.
 */
export const create = (data: Partial<IUserDocument>): Promise<IUserDocument> =>
    userModel
        .create({
            email: data.email,
            username: data.username,
            password: data.password,
            imageUrl: data.imageUrl,
            admin: data.admin,
            deletedAt: data.deletedAt,
            cartUpdatedAt: data.cart?.updatedAt ?? new Date()
        } as never)
        .then((user) => {
            const items = data.cart?.items ?? [];
            const tokens = data.tokens ?? [];
            return Promise.all([
                Promise.all(
                    items.map((item) =>
                        cartItemModel.create({
                            userId: user.id,
                            productId: Number(item.product),
                            quantity: item.quantity
                        } as never)
                    )
                ),
                Promise.all(
                    tokens.map((token) =>
                        userTokenModel.create({
                            userId: user.id,
                            type: token.type,
                            token: token.token,
                            expiration: token.expiration ?? undefined
                        } as never)
                    )
                )
            ]).then(() => withComputedRelations(user));
        }) as Promise<IUserDocument>;

/**
 * Saves changes.
 *
 * @param user - User document used to scope the operation.
 */
export const save = (user: IUserDocument): Promise<IUserDocument> =>
    user.save().then(() => withComputedRelations(user)) as Promise<IUserDocument>;

/**
 * Deletes one.
 *
 * @param user - User document used to scope the operation.
 */
export const deleteOne = (user: IUserDocument): Promise<void> =>
    user.destroy().then(() => {});

/**
 * Updates many.
 *
 * @param filter - Filter conditions used to target records.
 * @param update - Update payload to persist.
 */
export const updateMany = (filter: UserWhere, update: Record<string, unknown>) => {
    if (filter['cart.items.product'] && update.removeFromCartItems) {
        const productId = Number(filter['cart.items.product']);
        return cartItemModel
            .destroy({ where: { productId } })
            .then((deletedCount) =>
                userModel
                    .update({ cartUpdatedAt: new Date() }, { where: {} })
                    .then(() => ({ modifiedCount: deletedCount }))
            );
    }

    if ('updateMany' in userModel && typeof userModel.updateMany === 'function')
        return userModel.updateMany(filter, update);

    return userModel
        .update(update as never, { where: toWhere(filter) })
        .then(([modifiedCount]) => ({ modifiedCount }));
};

export const userRepository = {
    findById,
    findOne,
    findAll,
    count,
    create,
    save,
    deleteOne,
    updateMany
};
