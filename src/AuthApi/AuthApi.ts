/* eslint-disable class-methods-use-this, @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, AxiosResponse } from 'axios';
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
	Credentials,
	AuthApiParams
} from '../types';

export default class AuthApi {
	private tokenEndpoint: string;
	private client: AxiosInstance;

	constructor( {
		baseUrl, tokenEndpoint, clientId, clientSecret
	}: AuthApiParams ) {
		this.tokenEndpoint = tokenEndpoint;

		this.client = axios.create( {
			baseURL: baseUrl,
			auth: {
				username: clientId,
				password: clientSecret
			}
		} );
	}

	requestAccessToken( { credentials }: AccessTokenParams ): Promise<AccessToken> {
		return this.makeAccessTokenRequest( 'password', credentials );
	}

	refreshAccessToken( { accessToken }: AccessTokenRefreshParams ): Promise<AccessToken> {
		if ( !accessToken.refreshToken ) {
			return Promise.reject( noRefreshTokenError() );
		}

		return this.makeAccessTokenRequest(
			'refresh_token',
			{ refresh_token: accessToken.refreshToken }
		);
	}

	private makeAccessTokenRequest(
		grantType: 'password' | 'refresh_token',
		credentials: Credentials
	): Promise<AccessToken> {
		const body = { grant_type: grantType, ...credentials };

		return this.client.post( this.tokenEndpoint, body )
			.then( response => this.createTokenFromResponse( response.data ) )
			.catch( ( error ) => {
				throw this.mapRequestError( error, grantType === 'refresh_token' );
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

		if ( status === 400 || status === 401 ) {
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
}
