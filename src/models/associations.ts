import { userModel } from './users';
import { productModel } from './products';
import { orderModel } from './orders';
import { cartItemModel } from './cart-items';
import { userTokenModel } from './user-tokens';
import { orderItemModel } from './order-items';

userModel.hasMany(cartItemModel, { foreignKey: 'userId', as: 'cartItems', onDelete: 'CASCADE' });
cartItemModel.belongsTo(userModel, { foreignKey: 'userId', as: 'user' });

productModel.hasMany(cartItemModel, { foreignKey: 'productId', as: 'cartEntries', onDelete: 'CASCADE' });
cartItemModel.belongsTo(productModel, { foreignKey: 'productId', as: 'product' });

userModel.hasMany(userTokenModel, { foreignKey: 'userId', as: 'tokens', onDelete: 'CASCADE' });
userTokenModel.belongsTo(userModel, { foreignKey: 'userId', as: 'user' });

userModel.hasMany(orderModel, { foreignKey: 'userId', as: 'orders', onDelete: 'CASCADE' });
orderModel.belongsTo(userModel, { foreignKey: 'userId', as: 'user' });

orderModel.hasMany(orderItemModel, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
orderItemModel.belongsTo(orderModel, { foreignKey: 'orderId', as: 'order' });

productModel.hasMany(orderItemModel, { foreignKey: 'productId', as: 'orderEntries' });
orderItemModel.belongsTo(productModel, { foreignKey: 'productId', as: 'sourceProduct' });
