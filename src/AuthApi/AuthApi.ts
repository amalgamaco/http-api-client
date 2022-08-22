/* eslint-disable class-methods-use-this, @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { HTTP_BAD_REQUEST, HTTP_UNAUTHORIZED } from '../constants';
import {
	InvalidCredentialsError,
	InvalidTokenRequestError,
	networkError,
	noRefreshTokenError,
	unexpectedFailedResponseMessage,
	unexpectedTokenResponseError
} from '../errors';
import {
	AccessToken,
	AccessTokenParams,
	AccessTokenRefreshParams,
	AccessTokenRequestResponse,
	AuthApiParams
} from '../types';

export default class AuthApi {
	private defaultGrantType: string;
	private createTokenEndpoint: string;
	private revokeTokenEndpoint: string;
	private client: AxiosInstance;

	constructor( {
		baseUrl,
		defaultGrantType = 'password',
		createTokenEndpoint,
		revokeTokenEndpoint,
		clientId,
		clientSecret
	}: AuthApiParams ) {
		this.defaultGrantType = defaultGrantType;
		this.createTokenEndpoint = createTokenEndpoint;
		this.revokeTokenEndpoint = revokeTokenEndpoint;

		this.client = axios.create( {
			baseURL: baseUrl,
			auth: {
				username: clientId,
				password: clientSecret
			}
		} );
	}

	requestAccessToken( {
		grantType = this.defaultGrantType,
		credentials
	}: AccessTokenParams ): Promise<AccessToken> {
		const body = { grant_type: grantType, ...credentials };

		return this.client.post( this.createTokenEndpoint, body )
			.then( response => this.createTokenFromResponse( response.data ) )
			.catch( ( error ) => {
				throw this.mapRequestError( error, grantType === 'refresh_token' );
			} );
	}

	refreshAccessToken( { accessToken }: AccessTokenRefreshParams ): Promise<AccessToken> {
		const { refreshToken } = accessToken;

		if ( !refreshToken ) {
			return Promise.reject( noRefreshTokenError() );
		}

		return this.requestAccessToken( {
			grantType: 'refresh_token',
			credentials: { refresh_token: refreshToken }
		} );
	}

	revokeAccessToken( accessToken: AccessToken ): Promise<void> {
		return this.makeAccessTokenRevocationRequest( accessToken )
			.then( () => undefined )
			.catch( ( error ) => {
				throw this.mapRequestError( error, false );
			} );
	}

	private createTokenFromResponse = ( response: unknown ): AccessToken => {
		if ( !this.isAccessTokenRequestResponse( response ) ) {
			throw unexpectedTokenResponseError();
		}

		return {
			token: response.access_token,
			type: response.token_type,
			expiresIn: response.expires_in || null,
			refreshToken: response.refresh_token || null
		};
	};

	private isAccessTokenRequestResponse(
		response: unknown
	): response is AccessTokenRequestResponse {
		// TODO: return true iff 'response' matches the expected token response schema
		return true;
	}

	private mapRequestError( error: any, requestedWithRefreshToken: boolean ): unknown {
		if ( axios.isAxiosError( error ) && !!error.response ) {
			return this.mapFailedResponseError( error.response, requestedWithRefreshToken );
		}
		if ( error.message === 'Network Error' ) return networkError();

		return error;
	}

	private mapFailedResponseError(
		response: AxiosResponse, requestedWithRefreshToken: boolean
	) {
		const { data, status } = response;

		if ( status === HTTP_BAD_REQUEST || status === HTTP_UNAUTHORIZED ) {
			const { error: code, error_description: description } = data;

			// A specific InvalidCredentialsError is thrown when user credentials are
			// invalid, so that apps can easily handle them to inform the user through
			// the login screen that his/her credentials are wrong.
			const ErrorClass = ( code === 'invalid_grant' && !requestedWithRefreshToken )
				? InvalidCredentialsError
				: InvalidTokenRequestError;

			return new ErrorClass( { code, httpStatus: status, description } );
		}

		return unexpectedFailedResponseMessage( status, data );
	}

	private makeAccessTokenRevocationRequest( accessToken: AccessToken ): Promise<void> {
		return this.client.post(
			this.revokeTokenEndpoint,
			undefined,
			{ params: { token: accessToken.token } }
		);
	}
}
