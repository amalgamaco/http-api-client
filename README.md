# HTTP API Client

[[_TOC_]]

## Introduction

This package provides an HTTP client that is essentially a wrapper over [Axios](https://github.com/axios/axios). The main feature provided by this client is the ability to connect with an HTTP API that implements the OAuth2 framework for authentication, using the *resource owner password credentials* flow.

How is this package useful for the typical case of an application with a frontend (web or mobile) and a backend that uses OAuth2? It will handle these things for you, which you normally need to do manually:
- Requesting access tokens (when logging in).
- Revoking access tokens (when logging out).
- Refreshing expired access tokens (with neither your intervention nor the end user's).

And all this in a way that doesn't mess with how you decide to actually store your access tokens.

IMPORTANT: it is strongly recommended to **read the [Introduction section of the OAuth2 specification](https://www.rfc-editor.org/rfc/rfc6749#section-1)**. It introduces important concepts that will make it easier to understand this guide. For example, we will often make references to the concept of *authorization server*.

## Installation

To install the package, run:

```sh
yarn install @amalgamaco/http-api-client
```
or
```sh
npm install @amalgamaco/http-api-client
```

## Basic usage

### Creating the `Api` instance

Suppose you are making a frontend application, and you need to connect to the corresponding backend, which exposes an HTTP API in the URL `https://my.api.com`.

If the API does not require authentication, or you will only be making requests to endpoints that do not require authentication, then you can create and use your `Api` instance like this:

```ts
import { Api } from '@amalgamaco/http-api-client';

const myApi = new Api( {
	baseUrl: 'https://my.api.com'
} );

myApi.get( '/some/resource' ).then( response => console.log( response ) );
myApi.post( '/some/things', { name: 'A thing' } );
```

### Setting up OAuth2 authentication

Now suppose the API implements the OAuth2's password credentials flow, which basically means that you need to request an access token in exchange of some user's credentials, and then send that token with every request you make. In that case you will need to know a few things:
- To which URL are you supposed to make the access token requests (create/refresh/revoke token)? This is normally the same URL of the backend API itself, but OAuth2 treats the authorization server (the one who receives these requests) as a separate entity.
- Which are the paths of the endpoints for creating and revoking access tokens? They are normally `/oauth/token` and `/oauth/revoke`.
- Which are the client ID and client secret you need to send for creating and revoking access tokens (these credentials authenticate the frontend app itself to the auth server)?

Once you know all that, you are ready to create your `AuthApi` instance. This is basically a client for the authorization server: by following the OAuth2 specification it abstracts away the requests for managing the access tokens. **You won't need to use this instance yourself** (expect in rare cases) but you should **pass it to the `Api` instance**, that will use it accordingly.

> NOTE: The `AuthApi` instance will work correctly as long as your web service implements the OAuth2 framework following the specification correctly. If it runs on Ruby on Rails with Doorkeeper then you should not have any problems as long as you don't change significantly the response payloads, both for access tokens and errors.
>
> For example, if the web service returns access tokens inside a root key `"response"` or similar, or you change the name of one of the keys, then the `AuthApi` will not be able to read responses correctly.

Apart from that, the `Api` instance expects you to store the access tokens obtained from the `AuthApi` wherever you need; you may save it in local storage, a cookie, some "authentication store", etc. That's why it expects two functions from you: one for getting the access token, and one for updating it.

The following code summarizes the setup explained above:

```ts
// This is fake, but represents a place where your app stores the access tokens.
// It is up to you.
const myStorage = new MyStorage( { ... } );

// Base URL. For simplicity we assume it is the same for the authorization server
// and the resource server (i.e. the web service itself).
const baseUrl = 'https://my.api.com';

// Create the client for the auth server. It handles token requests and revokes.
const myAuthApi = new AuthApi( {
	baseUrl,
	createTokenEndpoint: '/oauth/token',
	revokeTokenEndpoint: '/oauth/revoke',
	clientId: 'my_client_id',
	clientSecret: 'my_client_secret'
} );

// Create the API client itself
// We instruct it to read and update the access token through our storage
const myApi = new Api( {
	baseUrl,
	authApi: myAuthApi,
	accessTokenGetter: () => myStorage.get( 'access_token' ),
	onAccessTokenUpdated: ( token ) => { myStorage.set( 'access_token', token ); }
} );
```

The `Api` will **always** use your `accessTokenGetter` to get the current access token, and include it in the `Authorization` header for every request you make through it. From now on, when we say "current access token", we refer to the one returned by the getter.

### Requesting an access token (or "logging in")

"So how do I request the first token from the web service then?" By calling `authenticate`:

```ts
myApi.authenticate( {
	credentials: {
		username: 'john',
		password: 'sekret'
	}
} );
```

This will make a request to create an access token in exchange for the given credentials, and once the server responds with one, it will be passed to your `onAccessTokenUpdated` callback. You are then supposed to update the token somehow and make the token getter return it from now on. That way, the `Api` will include it in the `Authorization` header for every request.

**This is what you should do when the user logs in through your app**. You don't need to and shouldn't make the token request yourself.

### Revoking an access token (or "logging out")

If you want to revoke the current access token, you should simply do the following:

```ts
myApi.revokeAccess();
```

This will send a request to revoke the access token, and call your `onAccessTokenUpdated` callback with the value `null`, so that you clear it from your storage.

**This is what you should do when the user logs out through your app**. You don't need to and shouldn't make the revocation request yourself.

### Using the `Api` instance

Making requests through the `Api` is very similar to the way in which you make them with Axios. There is a base `request` method which accepts a `config` object where you define the method, path, headers, etc., and then you have shortcut methods for each HTTP verb that internally end up using the `request` method.

```ts
// For the shortcut methods, the "config" parameter is always optional
myApi.get( path, config ); // Makes a GET request to the given path
myApi.post( path, data, config ); // Makes a POST request. "data" is optional
myApi.put( path, data, config ); // Similar to "post"
myApi.patch( path, data, config ); // Similar to "post"
myApi.delete( path, config ); // Similar to "get"

// Generic request method, you pass everything in the config object
myApi.request( config );
```

All these methods return a promise that resolves with the response body, which is a parsed JSON object. If the response status is not OK, then a `FailedResponseError` exception is thrown. You can see more details in the reference section.

If the current access token is present, it will be sent in the `Authorization` header preceded by the "Bearer" keyword; otherwise the `Authorization` header won't be sent.

### Support for refresh tokens

"What should I do if the web service returns access tokens with expiry time and a refresh token?"

The answer is "nothing". If you make a request through the `Api` instance and a 401 response is received (which happens when the access token has expired), then it will:
- Check if the current access token has an associated refresh token.
- Request a new access token to the authorization server, sending the refresh token.
- Call the `onAccessTokenUpdated` callback with the new access token.
- Retry the request (if a 401 is received again then it won't attempt to refresh the token).

This way you don't need to do anything on your side to refresh tokens, and the same goes for the end user of your app.

## Reference

### `Api`

The class for the HTTP client. It has the following methods.

#### `constructor( params: ApiParams ): Api`

Creates a new `Api` instance.

**Parameters**

| Name | Type | Description | Default/Required |
|-|-|-|-|
| `baseUrl` | `string` | The base URL to be used for all requests, except the access token ones (create/refresh/revoke). | Required |
| `authApi` | [`IAuthApi`](#iauthapi) | A client for an OAuth2 authorization server to use for requesting access tokens and using them for all requests. | `undefined` |
| `accessTokenGetter` | `() => AccessToken | null | undefined` | A function that returns the current access token. The `Api` uses it for all requests. This gives the possibility of storing and caching the access token in any way. | `undefined` |
| `onAccessTokenUpdated` | `( accessToken: AccessToken | null ) =>  void` | A callback that receives an access token or `null`. It is called every time the access token changes, either because one was requested manually (calling `authenticate`), refreshed, or revoked. | `undefined` |

####  `authenticate( authParams: AccessTokenParams ): Promise<void>`

Requests a new access token by making a request to the authorization server, following the OAuth2 specification for constructing the request.

**Parameters**

| Name | Type | Description | Default/Required |
|-|-|-|-|
| `grantType` | `string` | The `"grant_type"` to use in the request body. | The `defaultGrantType` passed to the `AuthApi` instance. |
| `credentials` | `Record<string, string>` | The credentials that will be sent in the request body. | Required |

Note that, if we strictly followed the OAuth2's password credentials flow, then:
- `grantType` should simply be the string `'password'`
- `credentials` should be an object with the keys `username` and `password` only.

The package makes it a bit more flexible; for instance, if you are using the non-official "assertion" flow, that is commonly used when your users are authenticated somewhere else (for example, in Firebase), then in `grantType` you can pass the string `'assertion'` and in `credentials` the object `{ assertion: '<your assertion>' }`.

If the request is successful, the received access token is passed to the `onAccessTokenUpdated` callback.

If it fails, the promise is rejected with one of the following exceptions:
- `InvalidCredentialsError`, if received status code is 400/401 and the `"error"` attribute in the body is `"invalid_grant"`.
- `InvalidTokenRequestError`, if received status code is 400/401 but the `"error"` attribute in the body is not `"invalid_grant"`.
- `NetworkError` if the request could not be made due to connection issues.
- Generic `Error` in any other case.

####  `revokeAccess(): Promise<void>`

Revokes the current access token, following the OAuth2 specification for making the revocation request.

If the request is successful, the `onAccessTokenUpdated` callback is called with the value `null`.

If it fails, the error handling applied is the same as the `authenticate` method.

#### `request( config: RequestConfig ): Promise<ApiResponse>`

Makes an HTTP request to the API. The method accepts a `config` object with parameters that configure the request.

**Parameters**

| Name | Type | Description | Default/Required |
|-|-|-|-|
| `method` | [`HTTPMethod`](#httpmethod) | The HTTP method to use. | Required |
| `path` | `string` | Request path. It is appended to the `baseUrl` construction parameter to form the final URL. | Required |
| `params` | [`QueryParams`](#queryparams) | Request query params. Nested query params are supported. | `undefined` |
| `data` | `[ key: string ]: unknown` | Request body. | `undefined` |
| `sendAsFormData` | `boolean` | Whether to send the body as form data or JSON. | `false` |
| `noRefreshToken` | `boolean` | If `true`, token refreshes won't be made for this request. | `false` |

The method returns a promise that resolves to the response received by the API. This response is of type [`ApiResponse`](#apiresponse) which is the response body parsed as JSON.

If there is an error with the request then the promise is rejected with one of the following exceptions:
- `FailedResponseError` if the status code is 400 or greater.
- `InvalidTokenRequestError` if a token refresh request was made in the middle (see below), but a 400/401 status code was received for it.
- `NetworkError` if the request could not be made due to connection issues.
- The error returned by Axios in any other case.

If the status code received is 401 and the current access token has an associated refresh token, then the `Api` will refresh that token by making a request to the authorization server; if it succeeds, then the `onAccessTokenUpdated` callback is called with the new access token, and the request is retried (but this time, no further refresh requests will be made, to avoid potential infinite loops).

#### `get( path: string, config?: Partial<RequestConfig> ): Promise<ApiResponse>`

A shortcut for making a GET request with a given path. The second parameter is an object with the same keys accepted in the `request` method.

#### `post( path: string, data?: RequestData, config?: Partial<RequestConfig> ): Promise<ApiResponse>`

A shortcut for making a GET request with a given path. The second parameter is an object with the same keys accepted in the `request` method.

#### `put( path: string, data?: RequestData, config?: Partial<RequestConfig> ): Promise<ApiResponse>`

A shortcut for making a PUT request with a given path and body. The second parameter is an object with the same keys accepted in the `request` method.

#### `patch( path: string, data?: RequestData, config?: Partial<RequestConfig> ): Promise<ApiResponse>`

A shortcut for making a PATCH request with a given path and body. The second parameter is an object with the same keys accepted in the `request` method.

#### `delete( path: string, config?: Partial<RequestConfig> ): Promise<ApiResponse>`

A shortcut for making a DELETE request with a given path. The second parameter is an object with the same keys accepted in the `request` method.

### `AuthApi`

The client class for the OAuth2 authorization server. Instances of this class are meant to be created and passed to the `Api` constructor. It's not necessary to use them directly.

#### `constructor( params: AuthApiParams ): AuthApi`

Constructs a new `AuthApi`.

**Parameters**

| Name | Type | Description | Default/Required |
|-|-|-|-|
| `baseUrl` | `string` | Base URL to use for the token requests. | Required |
| `defaultGrantType` | `string` | Default `"grant_type"` to use for all requests. | `'password'` |
| `createTokenEndpoint` | `string` | Path of the endpoint for creating access tokens. | Required |
| `revokeTokenEndpoint` | `string` | Path of the endpoint for revoking access tokens. | Required |
| `clientId` | `string` | Client ID to send with every request. | Required |
| `clientSecret` | `string` | Client secret to send with every request. | Required |

> NOTE: when making token creation or revocation requests, the client ID and secret are sent using HTTP Basic authentication as suggested in the OAuth2 specification.

### Type reference

#### `AccessToken`

```ts
interface AccessToken {
	token: string,
	type: string,
	expiresIn: number | null,
	refreshToken: string | null
}
```

#### `AccessTokenGetter`

```ts
type AccessTokenGetter = () => AccessToken | null | undefined;
```

#### `AccessTokenRequestResponse`

```ts
interface AccessTokenRequestResponse {
	access_token: string,
	token_type: string,
	expires_in?: number | null,
	refresh_token?: string | null
}
```

#### `AccessTokenParams`

```ts
interface AccessTokenParams {
	grantType?: GrantType,
	credentials: Credentials
}
```

#### `AccessTokenRefreshParams`

```ts
interface AccessTokenRefreshParams {
	accessToken: AccessToken
}
```

#### `AccessTokenUpdateCallback`

```ts
type AccessTokenUpdateCallback = ( accessToken: AccessToken | null ) => void;
```

#### `ApiParams`

```ts
interface ApiParams {
	baseUrl: string,
	authApi?: IAuthApi,
	accessTokenGetter?: AccessTokenGetter,
	onAccessTokenUpdated?: AccessTokenUpdateCallback
}
```

#### `ApiResponse`

```ts
type ApiResponse = JSONValue;
```

#### `AuthApiParams`

```ts
interface AuthApiParams {
	baseUrl: string,
	defaultGrantType?: GrantType,
	createTokenEndpoint: string,
	revokeTokenEndpoint: string,
	clientId: string,
	clientSecret: string
}
```

#### `Credentials`

```ts
type Credentials = Record<string, string>;
```

#### `GrantType`

```ts
type GrantType = string;
```

#### `HTTPMethod`

```ts
type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
```

#### `IAuthApi`

```ts
interface IAuthApi {
	requestAccessToken: ( authParams: AccessTokenParams ) => Promise<AccessToken>,
	refreshAccessToken: ( refreshParams: AccessTokenRefreshParams ) => Promise<AccessToken>,
	revokeAccessToken: ( accessToken: AccessToken ) => Promise<void>
}
```

#### `JSONValue`

```ts
type JSONValue =
    | string
    | number
    | boolean
    | null
    | { [ key: string ]: JSONValue }
    | Array<JSONValue>;
```

#### `QueryParam`

```ts
type QueryParam =
	| string
	| number
	| QueryParam[]
	| { [ key: string ]: QueryParam }
```

#### `QueryParams`

```ts
type QueryParams = Record<string, QueryParam>
```

#### `RequestConfig`

```ts
interface RequestConfig {
	method: HTTPMethod,
	path: string,
	params?: QueryParams,
	data?: RequestData,
	sendAsFormData?: boolean,
	noRefreshToken?: boolean
}
```

#### `RequestData`

```ts
interface RequestData {
	[ key: string ]: unknown;
}
```
