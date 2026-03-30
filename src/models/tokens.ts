import { Table, Column, Model, DataType, CreatedAt, UpdatedAt } from 'sequelize-typescript';

/**
 * User tokens
 * Token is like an ID, but not really an ID
 */
export interface IToken {
    id?: number;
    userId: number;
    token: string;
    type: string;
    expiration?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Token Model
 */
@Table({
    tableName: 'tokens',
    timestamps: true,
})
export class TokenModel extends Model<IToken> {
    @Column({
        type: DataType.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    })
    declare id: number;

    @Column({
        type: DataType.INTEGER.UNSIGNED,
        allowNull: false,
    })
    declare userId: number;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
    })
    declare type: string;

    @Column({
        type: DataType.STRING(500),
        allowNull: false,
    })
    declare token: string;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    declare expiration?: Date;

    @CreatedAt
    declare createdAt: Date;

    @UpdatedAt
    declare updatedAt: Date;
}

export default TokenModel;
