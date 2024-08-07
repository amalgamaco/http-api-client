/* eslint-disable class-methods-use-this, @typescript-eslint/no-explicit-any */
import axios, {
	AxiosInstance, AxiosRequestConfig, AxiosRequestHeaders, AxiosResponse
} from 'axios';
import { stringify } from 'qs';
import {
	AccessTokenParams,
	AccessTokenGetter,
	AccessTokenUpdateCallback,
	ApiParams,
	ApiResponse,
	IAuthApi,
	QueryParams,
	RequestConfig,
	RequestData
} from '../types';
import { FailedResponseError, missingAuthApiError, networkError } from '../errors';
import { HTTP_UNAUTHORIZED } from '../constants';
import { serializeRequestDataForContentType } from './utils';

export default class Api {
	private client: AxiosInstance;
	private authApi?: IAuthApi;
	private accessTokenGetter: AccessTokenGetter;
	private onAccessTokenUpdated: AccessTokenUpdateCallback;

	constructor( {
		baseUrl, authApi, accessTokenGetter, onAccessTokenUpdated, config = {}
	}: ApiParams ) {
		this.authApi = authApi;
		this.accessTokenGetter = accessTokenGetter || ( () => undefined );
		this.onAccessTokenUpdated = onAccessTokenUpdated || ( () => undefined );

		this.client = axios.create( {
			baseURL: baseUrl,
			paramsSerializer: ( params: QueryParams ) => (
				// Serialization compatible with Rails apps
				stringify( params, { arrayFormat: 'brackets' } )
			),
			...config
		} );
	}

	get( path: string, config?: Partial<RequestConfig> ): Promise<ApiResponse> {
		return this.request( { method: 'get', path, ...config } );
	}

	post( path: string, data?: RequestData, config?: Partial<RequestConfig> ): Promise<ApiResponse> {
		return this.request( {
			method: 'post', path, data, ...config
		} );
	}

	put( path: string, data?: RequestData, config?: Partial<RequestConfig> ): Promise<ApiResponse> {
		return this.request( {
			method: 'put', path, data, ...config
		} );
	}

	patch( path: string, data?: RequestData, config?: Partial<RequestConfig> ): Promise<ApiResponse> {
		return this.request( {
			method: 'patch', path, data, ...config
		} );
	}

	delete( path: string, config?: Partial<RequestConfig> ): Promise<ApiResponse> {
		return this.request( { method: 'delete', path, ...config } );
	}

	authenticate( authParams: AccessTokenParams ): Promise<void> {
		if ( !this.authApi ) return Promise.reject( missingAuthApiError() );

		return this.authApi.requestAccessToken( authParams ).then(
			accessToken => this.onAccessTokenUpdated( accessToken )
		);
	}

	revokeAccess(): Promise<void> {
		if ( !this.authApi ) return Promise.reject( missingAuthApiError() );
		if ( !this.accessToken ) return Promise.resolve();

		return this.authApi.revokeAccessToken( this.accessToken )
			.then( () => this.onAccessTokenUpdated( null ) );
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
			headers: this.requestHeadersFor( config ),
			data: config.data,
			transformRequest: serializeRequestDataForContentType,
			timeout: config.timeout
		} );
	}

	private requestHeadersFor( config: RequestConfig ): AxiosRequestHeaders {
		const contentType = config.sendAsFormData ? 'multipart/form-data' : 'application/json';

		return { 'Content-Type': contentType, ...this.authHeaders() };
	}

	private authHeaders(): AxiosRequestHeaders {
		if ( !this.accessToken ) return {};

		return { Authorization: `Bearer ${this.accessToken.token}` };
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

		if ( status === HTTP_UNAUTHORIZED && this.canRefreshToken() && !requestConfig.noRefreshToken ) {
			return this.refreshTokenAndRetryRequest( requestConfig );
		}

		throw new FailedResponseError( { data, status } );
	}

	private canRefreshToken(): boolean {
		return !!this.authApi && !!this.accessToken?.refreshToken;
	}

	private refreshTokenAndRetryRequest( requestConfig: RequestConfig ): Promise<ApiResponse> {
		return ( this.authApi as IAuthApi )
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			.refreshAccessToken( { accessToken: this.accessToken! } )
			.then( accessToken => this.onAccessTokenUpdated( accessToken ) )
			// Refresh tokens are not used while retrying to avoid potential infinite loops
			.then( () => this.request( { ...requestConfig, noRefreshToken: true } ) );
	}

	private get accessToken(): ReturnType<AccessTokenGetter> {
		return this.accessTokenGetter();
	}
}
