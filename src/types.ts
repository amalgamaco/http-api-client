import { AxiosRequestConfig } from 'axios';

export type GrantType = string;

export interface AuthApiParams {
	baseUrl: string,
	defaultGrantType?: GrantType,
	createTokenEndpoint: string,
	revokeTokenEndpoint: string,
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
	grantType?: GrantType,
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
	refreshAccessToken: ( refreshParams: AccessTokenRefreshParams ) => Promise<AccessToken>,
	revokeAccessToken: ( accessToken: AccessToken ) => Promise<void>
}

export type AccessTokenGetter = () => AccessToken | null | undefined;
export type AccessTokenUpdateCallback = ( accessToken: AccessToken | null ) => void;

export type ApiDefaultConfig = Exclude<
	AxiosRequestConfig,
	'url' | 'method' | 'baseUrl' | 'params' | 'data'
>;

export interface ApiParams {
	baseUrl: string,
	authApi?: IAuthApi,
	accessTokenGetter?: AccessTokenGetter,
	onAccessTokenUpdated?: AccessTokenUpdateCallback,
	config?: ApiDefaultConfig
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

export interface RequestData {
	[ key: string ]: unknown;
}

export interface RequestConfig {
	method: HTTPMethod,
	path: string,
	params?: QueryParams,
	data?: RequestData,
	sendAsFormData?: boolean,
	noRefreshToken?: boolean,
	timeout?: number
}

export type ApiResponse = JSONValue;
