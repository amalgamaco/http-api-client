/* eslint-disable class-methods-use-this, @typescript-eslint/no-explicit-any */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { stringify } from 'qs';
import {
	AccessToken,
	AccessTokenParams,
	AccessTokenGetter,
	AccessTokenUpdateCallback,
	ApiParams,
	ApiResponse,
	JSONValue,
	QueryParams,
	RequestConfig,
	IAuthApi
} from '../types';
import { FailedResponseError, missingAuthApiError, networkError } from '../errors';

export default class Api {
	private client: AxiosInstance;
	private authApi?: IAuthApi;
	private accessTokenGetter: AccessTokenGetter;
	private onAccessTokenUpdated: AccessTokenUpdateCallback;

	constructor( {
		baseUrl, authApi, accessTokenGetter, onAccessTokenUpdated
	}: ApiParams ) {
		this.authApi = authApi;
		this.accessTokenGetter = accessTokenGetter || ( () => undefined );
		this.onAccessTokenUpdated = onAccessTokenUpdated || ( () => undefined );

		this.client = axios.create( {
			baseURL: baseUrl,
			paramsSerializer: ( params: QueryParams ) => (
				// Serialization compatible with Rails apps
				stringify( params, { arrayFormat: 'brackets' } )
			)
		} );
	}

	get( path: string, config?: RequestConfig ) {
		return this.request( { method: 'get', path, ...config } );
	}

	post( path: string, data?: JSONValue, config?: RequestConfig ): Promise<ApiResponse> {
		return this.request( {
			method: 'post', path, data, ...config
		} );
	}

	put( path: string, data?: JSONValue, config?: RequestConfig ): Promise<ApiResponse> {
		return this.request( {
			method: 'put', path, data, ...config
		} );
	}

	patch( path: string, data?: JSONValue, config?: RequestConfig ): Promise<ApiResponse> {
		return this.request( {
			method: 'patch', path, data, ...config
		} );
	}

	delete( path: string, config?: RequestConfig ): Promise<ApiResponse> {
		return this.request( { method: 'delete', path, ...config } );
	}

	authenticate( authParams: AccessTokenParams ): Promise<void> {
		if ( !this.authApi ) return Promise.reject( missingAuthApiError() );

		return this.authApi.requestAccessToken( authParams ).then(
			accessToken => this.onAccessTokenUpdated( accessToken )
		);
	}

	request( config: RequestConfig ): Promise<ApiResponse> {
		return this.client.request( this.axiosRequestConfigFor( config ) )
			.then( response => response.data as ApiResponse )
			.catch( error => this.handleRequestError( error, config ) );
	}

	private axiosRequestConfigFor( config: RequestConfig ): AxiosRequestConfig {
		return ( {
			method: config.method,
			url: config.path,
			params: config.params,
			headers: this.authHeaders(),
			data: config.data
		} );
	}

	private authHeaders(): Record<string, string> {
		const accessToken = this.accessTokenGetter();

		if ( !accessToken ) return {};

		return { Authorization: `Bearer ${accessToken.token}` };
	}

	private handleRequestError( error: any, requestConfig: RequestConfig ): Promise<ApiResponse> {
		if ( axios.isAxiosError( error ) && !!error.response ) {
			return this.handleFailedResponseError( error.response, requestConfig );
		}
		if ( error.message === 'Network Error' ) throw networkError();

		throw error;
	}

	private handleFailedResponseError(
		response: AxiosResponse, requestConfig: RequestConfig
	): Promise<ApiResponse> {
		const { status, data } = response;

		if ( status === 401 && this.canRefreshToken() && !requestConfig.noRefreshToken ) {
			return this.refreshTokenAndRetryRequest( requestConfig );
		}

		throw new FailedResponseError( { data, status } );
	}

	private canRefreshToken(): boolean {
		return !!this.authApi && !!this.accessTokenGetter()?.refreshToken;
	}

	private refreshTokenAndRetryRequest( requestConfig: RequestConfig ): Promise<ApiResponse> {
		return ( this.authApi as IAuthApi )
			.refreshAccessToken( { accessToken: ( this.accessTokenGetter() as AccessToken ) } )
			.then( accessToken => this.onAccessTokenUpdated( accessToken ) )
			// Refresh tokens are not used while retrying to avoid potential infinite loops
			.then( () => this.request( { ...requestConfig, noRefreshToken: true } ) );
	}
}
