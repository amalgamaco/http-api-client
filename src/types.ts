export interface AuthApiParams {
	baseUrl: string,
	tokenEndpoint: string,
	clientId: string,
	clientSecret: string
}

export type Credentials = Record<string, string>;

export interface AccessToken {
	token: string,
	type: string,
	expiresIn: number | null,
	refreshToken: string | null
}

export interface AccessTokenParams {
	credentials: Credentials
}

export interface AccessTokenRefreshParams {
	accessToken: AccessToken
}

export interface AccessTokenRequestResponse {
	access_token: string,
	token_type: string,
	expires_in?: number | null,
	refresh_token?: string | null
}

export interface IAuthApi {
	requestAccessToken: ( authParams: AccessTokenParams ) => Promise<AccessToken>,
	refreshAccessToken: ( refreshParams: AccessTokenRefreshParams ) => Promise<AccessToken>
}

export type AccessTokenGetter = () => AccessToken | null | undefined;
export type AccessTokenUpdateCallback = ( accessToken: AccessToken ) => void;

export interface ApiParams {
	baseUrl: string,
	authApi?: IAuthApi,
	accessTokenGetter?: AccessTokenGetter,
	onAccessTokenUpdated?: AccessTokenUpdateCallback
}

export type HTTPMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export type QueryParam =
	| string
	| number
	| QueryParam[]
	| { [ key: string ]: QueryParam }

export type QueryParams = Record<string, QueryParam>

export type JSONValue =
    | string
    | number
    | boolean
    | null
    | { [ key: string ]: JSONValue }
    | Array<JSONValue>;

export interface RequestConfig {
	method: HTTPMethod,
	path: string,
	params?: QueryParams,
	data?: JSONValue,
	noRefreshToken?: boolean
}

export type ApiResponse = JSONValue;
