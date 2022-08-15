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
