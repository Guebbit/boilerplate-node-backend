# DefaultApi

All URIs are relative to *http://localhost:3000*

|Method | HTTP request | Description|
|------------- | ------------- | -------------|
|[**addCartItem**](#addcartitem) | **POST** /cart | Add/update cart item (JSON)|
|[**addCartItemPath**](#addcartitempath) | **PUT** /cart/{productId}/{quantity} | Add/update cart item (path params)|
|[**addProductJson**](#addproductjson) | **PUT** /products/add | Add product (JSON)|
|[**addProductMultipart**](#addproductmultipart) | **POST** /products/add | Add product (multipart with image)|
|[**addUserJson**](#adduserjson) | **PUT** /users/add | Add user (JSON)|
|[**addUserMultipart**](#addusermultipart) | **POST** /users/add | Add user (multipart with image)|
|[**clearCart**](#clearcart) | **DELETE** /cart | Delete all cart items|
|[**confirmPasswordReset**](#confirmpasswordreset) | **POST** /account/reset/{token} | Confirm password reset|
|[**createOrder**](#createorder) | **POST** /orders/new | Create order|
|[**createOrderAlt**](#createorderalt) | **PUT** /orders/new | Create order (alternate)|
|[**deleteCartItem**](#deletecartitem) | **DELETE** /cart/{productId} | Delete a cart item (path param)|
|[**deleteCartItemJson**](#deletecartitemjson) | **POST** /cart/delete | Delete a cart item (JSON)|
|[**deleteExpiredTokens**](#deleteexpiredtokens) | **DELETE** /users/tokens | Delete expired user tokens|
|[**deleteProduct**](#deleteproduct) | **DELETE** /products/delete/{id} | Delete product|
|[**deleteUser**](#deleteuser) | **DELETE** /users/delete/{id} | Delete user|
|[**editProductJson**](#editproductjson) | **PATCH** /products/edit | Edit product (JSON)|
|[**editProductJsonAlt**](#editproductjsonalt) | **PATCH** /products/edit/{id} | Edit product (alt JSON)|
|[**editProductMultipart**](#editproductmultipart) | **POST** /products/edit/{id} | Edit product (multipart, image)|
|[**editUserJson**](#edituserjson) | **PATCH** /users/edit | Edit user (JSON)|
|[**editUserJsonAlt**](#edituserjsonalt) | **PATCH** /users/edit/{id} | Edit user (alt JSON)|
|[**editUserMultipart**](#editusermultipart) | **POST** /users/edit/{id} | Edit user (multipart, image)|
|[**getCart**](#getcart) | **GET** /cart | Get cart|
|[**getHeavy**](#getheavy) | **GET** /heavy | Heavy Request|
|[**getHome**](#gethome) | **GET** / | Home|
|[**getInvoice**](#getinvoice) | **GET** /orders/invoice/{id} | Get order invoice|
|[**getOrder**](#getorder) | **GET** /orders/details/{id} | Get order details|
|[**getProduct**](#getproduct) | **GET** /products/details/{id} | Get product|
|[**getProfile**](#getprofile) | **GET** /account | Get profile|
|[**getUser**](#getuser) | **GET** /users/details/{id} | Get user details|
|[**listOrders**](#listorders) | **GET** /orders/{page} | List orders (paginated)|
|[**listProducts**](#listproducts) | **GET** /products/{page} | List products (paginated)|
|[**listUsers**](#listusers) | **GET** /users/{page} | List users (paginated)|
|[**login**](#login) | **POST** /account/login | Login|
|[**logout**](#logout) | **GET** /account/logout | Logout|
|[**logoutAll**](#logoutall) | **GET** /account/logout-all | Logout from all devices|
|[**refreshToken**](#refreshtoken) | **GET** /account/refresh | Refresh auth token (uses refresh cookie)|
|[**requestPasswordReset**](#requestpasswordreset) | **POST** /account/reset | Request password reset|
|[**resetDatabase**](#resetdatabase) | **GET** /reset-database | Reset Database (dev/test)|
|[**signup**](#signup) | **POST** /account/signup | Signup|

# **addCartItem**
> addCartItem(cartItemInput)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    CartItemInput
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let cartItemInput: CartItemInput; //

const { status, data } = await apiInstance.addCartItem(
    cartItemInput
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **cartItemInput** | **CartItemInput**|  | |


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated cart |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **addCartItemPath**
> addCartItemPath()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let productId: string; // (default to undefined)
let quantity: number; // (default to undefined)

const { status, data } = await apiInstance.addCartItemPath(
    productId,
    quantity
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **productId** | [**string**] |  | defaults to undefined|
| **quantity** | [**number**] |  | defaults to undefined|


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated cart |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **addProductJson**
> Product addProductJson(addProductRequestJSON)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    AddProductRequestJSON
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let addProductRequestJSON: AddProductRequestJSON; //

const { status, data } = await apiInstance.addProductJson(
    addProductRequestJSON
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **addProductRequestJSON** | **AddProductRequestJSON**|  | |


### Return type

**Product**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created product |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **addProductMultipart**
> Product addProductMultipart()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let title: string; // (default to undefined)
let price: number; // (default to undefined)
let description: string; // (default to undefined)
let active: boolean; // (default to undefined)
let imageUpload: File; // (optional) (default to undefined)

const { status, data } = await apiInstance.addProductMultipart(
    title,
    price,
    description,
    active,
    imageUpload
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **title** | [**string**] |  | defaults to undefined|
| **price** | [**number**] |  | defaults to undefined|
| **description** | [**string**] |  | defaults to undefined|
| **active** | [**boolean**] |  | defaults to undefined|
| **imageUpload** | [**File**] |  | (optional) defaults to undefined|


### Return type

**Product**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created product |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **addUserJson**
> User addUserJson(addUserRequestJSON)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    AddUserRequestJSON
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let addUserRequestJSON: AddUserRequestJSON; //

const { status, data } = await apiInstance.addUserJson(
    addUserRequestJSON
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **addUserRequestJSON** | **AddUserRequestJSON**|  | |


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created user |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **addUserMultipart**
> User addUserMultipart()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let email: string; // (default to undefined)
let username: string; // (default to undefined)
let password: string; // (default to undefined)
let admin: boolean; // (default to undefined)
let active: boolean; // (default to undefined)
let imageUpload: File; // (optional) (default to undefined)

const { status, data } = await apiInstance.addUserMultipart(
    email,
    username,
    password,
    admin,
    active,
    imageUpload
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **email** | [**string**] |  | defaults to undefined|
| **username** | [**string**] |  | defaults to undefined|
| **password** | [**string**] |  | defaults to undefined|
| **admin** | [**boolean**] |  | defaults to undefined|
| **active** | [**boolean**] |  | defaults to undefined|
| **imageUpload** | [**File**] |  | (optional) defaults to undefined|


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created user |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **clearCart**
> MessageResponse clearCart()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.clearCart();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**MessageResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Cleared |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **confirmPasswordReset**
> MessageResponse confirmPasswordReset(resetConfirmRequest)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    ResetConfirmRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let token: string; // (default to undefined)
let resetConfirmRequest: ResetConfirmRequest; //

const { status, data } = await apiInstance.confirmPasswordReset(
    token,
    resetConfirmRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **resetConfirmRequest** | **ResetConfirmRequest**|  | |
| **token** | [**string**] |  | defaults to undefined|


### Return type

**MessageResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Password reset |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createOrder**
> Order createOrder()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.createOrder();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Order**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created order |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **createOrderAlt**
> Order createOrderAlt()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.createOrderAlt();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Order**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created order |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteCartItem**
> deleteCartItem()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let productId: string; // (default to undefined)

const { status, data } = await apiInstance.deleteCartItem(
    productId
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **productId** | [**string**] |  | defaults to undefined|


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated cart |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteCartItemJson**
> deleteCartItemJson(cartItemInput)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    CartItemInput
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let cartItemInput: CartItemInput; //

const { status, data } = await apiInstance.deleteCartItemJson(
    cartItemInput
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **cartItemInput** | **CartItemInput**|  | |


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated cart |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteExpiredTokens**
> MessageResponse deleteExpiredTokens()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.deleteExpiredTokens();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**MessageResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Cleanup done |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteProduct**
> MessageResponse deleteProduct()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)
let hardDelete: boolean; // (optional) (default to undefined)

const { status, data } = await apiInstance.deleteProduct(
    id,
    hardDelete
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|
| **hardDelete** | [**boolean**] |  | (optional) defaults to undefined|


### Return type

**MessageResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Deleted |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **deleteUser**
> MessageResponse deleteUser()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)
let hardDelete: boolean; // (optional) (default to undefined)

const { status, data } = await apiInstance.deleteUser(
    id,
    hardDelete
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|
| **hardDelete** | [**boolean**] |  | (optional) defaults to undefined|


### Return type

**MessageResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Deleted |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **editProductJson**
> Product editProductJson(editProductRequestJSON)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    EditProductRequestJSON
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let editProductRequestJSON: EditProductRequestJSON; //

const { status, data } = await apiInstance.editProductJson(
    editProductRequestJSON
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **editProductRequestJSON** | **EditProductRequestJSON**|  | |


### Return type

**Product**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated product |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **editProductJsonAlt**
> Product editProductJsonAlt(editProductJsonAltRequest)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    EditProductJsonAltRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)
let editProductJsonAltRequest: EditProductJsonAltRequest; //

const { status, data } = await apiInstance.editProductJsonAlt(
    id,
    editProductJsonAltRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **editProductJsonAltRequest** | **EditProductJsonAltRequest**|  | |
| **id** | [**string**] |  | defaults to undefined|


### Return type

**Product**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated product |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **editProductMultipart**
> Product editProductMultipart()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)
let title: string; // (optional) (default to undefined)
let price: number; // (optional) (default to undefined)
let imageUpload: File; // (optional) (default to undefined)

const { status, data } = await apiInstance.editProductMultipart(
    id,
    title,
    price,
    imageUpload
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|
| **title** | [**string**] |  | (optional) defaults to undefined|
| **price** | [**number**] |  | (optional) defaults to undefined|
| **imageUpload** | [**File**] |  | (optional) defaults to undefined|


### Return type

**Product**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated product |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **editUserJson**
> User editUserJson(editUserRequestJSON)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    EditUserRequestJSON
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let editUserRequestJSON: EditUserRequestJSON; //

const { status, data } = await apiInstance.editUserJson(
    editUserRequestJSON
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **editUserRequestJSON** | **EditUserRequestJSON**|  | |


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated user |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **editUserJsonAlt**
> User editUserJsonAlt(editUserRequestJSON)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    EditUserRequestJSON
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)
let editUserRequestJSON: EditUserRequestJSON; //

const { status, data } = await apiInstance.editUserJsonAlt(
    id,
    editUserRequestJSON
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **editUserRequestJSON** | **EditUserRequestJSON**|  | |
| **id** | [**string**] |  | defaults to undefined|


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated user |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **editUserMultipart**
> User editUserMultipart()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)
let email: string; // (optional) (default to undefined)
let imageUpload: File; // (optional) (default to undefined)

const { status, data } = await apiInstance.editUserMultipart(
    id,
    email,
    imageUpload
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|
| **email** | [**string**] |  | (optional) defaults to undefined|
| **imageUpload** | [**File**] |  | (optional) defaults to undefined|


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: multipart/form-data
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Updated user |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getCart**
> Array<CartItem> getCart()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.getCart();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**Array<CartItem>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Cart items |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getHeavy**
> getHeavy()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.getHeavy();
```

### Parameters
This endpoint does not have any parameters.


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getHome**
> getHome()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.getHome();
```

### Parameters
This endpoint does not have any parameters.


### Return type

void (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getInvoice**
> Invoice getInvoice()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getInvoice(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**Invoice**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Invoice |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getOrder**
> Order getOrder()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getOrder(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**Order**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Order |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getProduct**
> Product getProduct()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getProduct(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**Product**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Product |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getProfile**
> User getProfile()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.getProfile();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | User profile |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **getUser**
> User getUser()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let id: string; // (default to undefined)

const { status, data } = await apiInstance.getUser(
    id
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **id** | [**string**] |  | defaults to undefined|


### Return type

**User**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | User |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listOrders**
> Array<Order> listOrders()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let page: number; // (default to undefined)
let product: string; // (optional) (default to undefined)
let user: string; // (optional) (default to undefined)
let email: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.listOrders(
    page,
    product,
    user,
    email
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **page** | [**number**] |  | defaults to undefined|
| **product** | [**string**] |  | (optional) defaults to undefined|
| **user** | [**string**] |  | (optional) defaults to undefined|
| **email** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<Order>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Orders page |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listProducts**
> Array<Product> listProducts()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let page: number; // (default to undefined)
let maxPrice: number; // (optional) (default to undefined)
let minPrice: number; // (optional) (default to undefined)
let text: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.listProducts(
    page,
    maxPrice,
    minPrice,
    text
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **page** | [**number**] |  | defaults to undefined|
| **maxPrice** | [**number**] |  | (optional) defaults to undefined|
| **minPrice** | [**number**] |  | (optional) defaults to undefined|
| **text** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<Product>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Products page |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **listUsers**
> Array<User> listUsers()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let page: number; // (default to undefined)
let text: string; // (optional) (default to undefined)

const { status, data } = await apiInstance.listUsers(
    page,
    text
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **page** | [**number**] |  | defaults to undefined|
| **text** | [**string**] |  | (optional) defaults to undefined|


### Return type

**Array<User>**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Users page |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **login**
> AuthTokens login(loginRequest)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    LoginRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let loginRequest: LoginRequest; //

const { status, data } = await apiInstance.login(
    loginRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **loginRequest** | **LoginRequest**|  | |


### Return type

**AuthTokens**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Auth tokens |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **logout**
> MessageResponse logout()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.logout();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**MessageResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Logged out |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **logoutAll**
> MessageResponse logoutAll()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.logoutAll();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**MessageResponse**

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Logged out everywhere |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **refreshToken**
> AuthTokens refreshToken()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.refreshToken();
```

### Parameters
This endpoint does not have any parameters.


### Return type

**AuthTokens**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | New tokens |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **requestPasswordReset**
> MessageResponse requestPasswordReset(resetRequest)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    ResetRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let resetRequest: ResetRequest; //

const { status, data } = await apiInstance.requestPasswordReset(
    resetRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **resetRequest** | **ResetRequest**|  | |


### Return type

**MessageResponse**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | Email sent |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **resetDatabase**
> resetDatabase()


### Example

```typescript
import {
    DefaultApi,
    Configuration
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

const { status, data } = await apiInstance.resetDatabase();
```

### Parameters
This endpoint does not have any parameters.


### Return type

void (empty response body)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: Not defined


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**200** | OK |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

# **signup**
> User signup(signupRequest)


### Example

```typescript
import {
    DefaultApi,
    Configuration,
    SignupRequest
} from './api';

const configuration = new Configuration();
const apiInstance = new DefaultApi(configuration);

let signupRequest: SignupRequest; //

const { status, data } = await apiInstance.signup(
    signupRequest
);
```

### Parameters

|Name | Type | Description  | Notes|
|------------- | ------------- | ------------- | -------------|
| **signupRequest** | **SignupRequest**|  | |


### Return type

**User**

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
|**201** | Created |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to Model list]](../README.md#documentation-for-models) [[Back to README]](../README.md)

