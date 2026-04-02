/* eslint-disable unicorn/no-negated-condition */
/* eslint-disable unicorn/no-null */
import { Op, type WhereOptions } from 'sequelize';
import { userModel } from '@models/users';
import type { IUserDocument } from '@models/users';
import { userTokenModel } from '@models/user-tokens';

type UserWhere = Record<string, unknown>;

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

const withComputedRelations = async (user: IUserDocument | null) => {
    if (!user) return null;

    const tokens = await userTokenModel.findAll({
        where: { userId: (user as unknown as { id: number }).id },
        raw: true
    });

    const cartItemsModule = await import('@models/cart-items');
    const cartItemModel = cartItemsModule.cartItemModel;

    const cartItems = await cartItemModel.findAll({
        where: { userId: (user as unknown as { id: number }).id },
        raw: true
    });

    (user as unknown as { tokens: unknown }).tokens = tokens.map((token) => ({
        type: token.type,
        token: token.token,
        expiration: token.expiration ? new Date(token.expiration) : undefined
    }));

    if ((user as unknown as { deletedAt?: Date | null }).deletedAt === null)
        (user as unknown as { deletedAt?: Date }).deletedAt = undefined;

    (user as unknown as { cart: unknown }).cart = {
        items: cartItems.map((item) => ({ product: item.productId, quantity: item.quantity })),
        updatedAt: (user as unknown as { cartUpdatedAt: Date }).cartUpdatedAt
    };

    return user;
};

export const findById = (id: string | number): Promise<IUserDocument | null> =>
    userModel
        .findByPk(Number(id))
        .then((user) => withComputedRelations(user as unknown as IUserDocument));

export const findOne = (where: UserWhere): Promise<IUserDocument | null> => {
    const includeToken = tokenFilter(where);
    return userModel
        .findOne({
            where: toWhere(where),
            include: includeToken ? [includeToken as never] : undefined
        })
        .then((user) => withComputedRelations(user as unknown as IUserDocument));
};

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
) => {
    const [sortField, sortDirection] = Object.entries(sort)[0] ?? ['createdAt', -1];
    return userModel
        .findAll({
            where: toWhere(where),
            order: [[sortField, sortDirection === -1 ? 'DESC' : 'ASC']],
            offset: skip,
            limit,
            raw: true
        })
        .then(
            (rows) => rows as unknown as IUserDocument[]
        );
};

export const count = (where: UserWhere = {}): Promise<number> =>
    userModel.count({ where: toWhere(where) });

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
        .then(async (user) => {
            const items = data.cart?.items ?? [];
            const tokens = data.tokens ?? [];
            const cartItemsModule = await import('@models/cart-items');
            const { cartItemModel } = cartItemsModule;
            await Promise.all(
                items.map((item) =>
                    cartItemModel.create({
                        userId: user.id,
                        productId: Number(item.product),
                        quantity: item.quantity
                    } as never)
                )
            );
            await Promise.all(
                tokens.map((token) =>
                    userTokenModel.create({
                        userId: user.id,
                        type: token.type,
                        token: token.token,
                        expiration: token.expiration ?? undefined
                    } as never)
                )
            );
            return withComputedRelations(user as unknown as IUserDocument);
        }) as Promise<IUserDocument>;

export const save = (user: IUserDocument): Promise<IUserDocument> =>
    (user as unknown as { save: () => Promise<IUserDocument> })
        .save()
        .then(() => withComputedRelations(user)) as Promise<IUserDocument>;

export const deleteOne = (user: IUserDocument): Promise<void> =>
    (user as unknown as { destroy: () => Promise<void> }).destroy().then(() => {});

export const updateMany = async (filter: UserWhere, update: Record<string, unknown>) => {
    const { cartItemModel } = await import('@models/cart-items');

    if (filter['cart.items.product'] && update.removeFromCartItems) {
        const productId = Number(filter['cart.items.product']);
        const deletedCount = await cartItemModel.destroy({ where: { productId } });
        await userModel.update({ cartUpdatedAt: new Date() }, { where: {} });
        return { modifiedCount: deletedCount };
    }

    if (typeof (userModel as unknown as { updateMany?: unknown }).updateMany === 'function')
        return (
            userModel as unknown as {
                updateMany: (
                    f: Record<string, unknown>,
                    u: Record<string, unknown>
                ) => Promise<{ modifiedCount: number }>;
            }
        ).updateMany(filter, update);

    const [modifiedCount] = await userModel.update(update as never, { where: toWhere(filter) });
    return { modifiedCount };
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
