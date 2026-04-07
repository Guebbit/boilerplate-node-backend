import {
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    NonAttribute
} from 'sequelize';
import { sequelize } from '@utils/database';

export class UserTokenModel extends Model<
    InferAttributes<UserTokenModel>,
    InferCreationAttributes<UserTokenModel>
> {
    declare id: number;
    declare userId: ForeignKey<number>;
    declare type: string;
    declare token: string;
    declare expiration: Date | null;
    declare createdAt: NonAttribute<Date>;
    declare updatedAt: NonAttribute<Date>;
}

UserTokenModel.init(
    {
        id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: DataTypes.INTEGER, allowNull: false },
        type: { type: DataTypes.STRING, allowNull: false },
        token: { type: DataTypes.STRING(512), allowNull: false },
        expiration: { type: DataTypes.DATE, allowNull: true }
    },
    {
        sequelize,
        tableName: 'user_tokens',
        modelName: 'UserToken',
        timestamps: true,
        indexes: [
            { fields: ['userId'] },
            { fields: ['token'] },
            { fields: ['type'] },
            { fields: ['expiration'] }
        ]
    }
);

export const userTokenModel = UserTokenModel;
