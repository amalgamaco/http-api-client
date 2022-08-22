import Api from '../../src/Api/Api';
import { FailedResponseError, InvalidCredentialsError, InvalidTokenRequestError } from '../../src/errors';
import NetworkError from '../../src/errors/NetworkError';

const axiosClientMock = {
	request: jest.fn()
};

const noAuthApiErrorMessage = (
	'Authentication parameters through the parameter \'authParams\' must be supplied '
	+ 'in the client constructor in order for the \'authenticate\' and \'revokeAccess\' '
	+ 'methods to work.'
);

jest.mock( 'axios', () => ( {
	...jest.requireActual( 'axios' ),
	__esModule: true,
	default: {
		create: () => axiosClientMock,
		isAxiosError: () => true
	}
} ) );

describe( 'Api', () => {
	const baseUrl = 'http://test.url';
	const accessToken = {
		token: 'test_token',
		type: 'bearer',
		expiresIn: 200,
		refreshToken: 'test_refresh_token'
	};
	const refreshedAccessToken = {
		token: 'test_refreshed_token',
		type: 'bearer',
		expiresIn: 200,
		refreshToken: 'another_test_refresh_token'
	};

	const authApi = {
		requestAccessToken: jest.fn( () => Promise.resolve( accessToken ) ),
		refreshAccessToken: jest.fn( () => Promise.resolve( refreshedAccessToken ) ),
		revokeAccessToken: jest.fn( () => Promise.resolve( undefined ) )
	};

	const onAccessTokenUpdated = jest.fn();

	const createApi = ( apiParams: object = {} ) => new Api( {
		baseUrl,
		authApi,
		accessTokenGetter: () => accessToken,
		onAccessTokenUpdated,
		...apiParams
	} );

	afterEach( () => jest.clearAllMocks() );

	describe( '@authenticate', () => {
		const credentials = { username: 'test', password: 'test' };

		describe( 'when the API was created without an OAuth2 auth API', () => {
			it( 'throws an error', async () => {
				expect.assertions( 1 );
				const api = createApi( { authApi: undefined } );

				try {
					await api.authenticate( { credentials } );
				} catch ( error ) {
					expect( ( error as Error ).message ).toEqual( noAuthApiErrorMessage );
				}
			} );
		} );

		describe( 'when the API was created with an OAuth2 auth API', () => {
			it( 'requests an access token to the auth API passing the provided credentials', () => {
				const api = createApi();

				api.authenticate( { credentials } );

				expect( authApi.requestAccessToken ).toHaveBeenCalledWith( { credentials } );
			} );

			describe( 'when the auth API successfully returns an access token', () => {
				it( 'calls the onAccessTokenUpdated callback with the returned access token', async () => {
					const api = createApi();

					await api.authenticate( { credentials } );

					expect( onAccessTokenUpdated ).toHaveBeenCalledWith( accessToken );
				} );
			} );

			describe( 'when the auth API throws an error', () => {
				it( 'throws the same error', async () => {
					expect.assertions( 1 );
					const error = new InvalidCredentialsError( {
						code: 'invalid_grant',
						httpStatus: 400,
						description: 'Invalid credentials'
					} );
					authApi.requestAccessToken.mockRejectedValueOnce( error );
					const api = createApi();

					try {
						await api.authenticate( { credentials } );
					} catch ( thrownError ) {
						expect( thrownError ).toEqual( error );
					}
				} );
			} );
		} );
	} );

	describe( '@revokeAccess', () => {
		describe( 'when the API was created without an OAuth2 auth API', () => {
			it( 'throws an error', async () => {
				expect.assertions( 1 );
				const api = createApi( { authApi: undefined } );

				try {
					await api.revokeAccess();
				} catch ( error ) {
					expect( ( error as Error ).message ).toEqual( noAuthApiErrorMessage );
				}
			} );
		} );

		describe( 'when the API was created with an OAuth2 auth API', () => {
			const itDoesNotRevokeAnyAccessToken = ( accessTokenGetterResult: null | undefined ) => {
				it( 'revokes the access token from the getter through the auth API', () => {
					const api = createApi( { accessTokenGetter: () => accessTokenGetterResult } );

					api.revokeAccess();

					expect( authApi.revokeAccessToken ).not.toHaveBeenCalled();
				} );
			};

			describe( 'and the access token getter returns null', () => {
				itDoesNotRevokeAnyAccessToken( null );
			} );

			describe( 'and the access token getter returns undefined', () => {
				itDoesNotRevokeAnyAccessToken( undefined );
			} );

			describe( 'and the access token getter returns an access token', () => {
				it( 'revokes the access token from the getter through the auth API', () => {
					const api = createApi();

					api.revokeAccess();

					expect( authApi.revokeAccessToken ).toHaveBeenCalledWith( accessToken );
				} );
			} );

			describe( 'when the auth API successfully revokes the access token', () => {
				it( 'calls the onAccessTokenUpdated callback with null as argument', async () => {
					const api = createApi();

					await api.revokeAccess();

					expect( onAccessTokenUpdated ).toHaveBeenCalledWith( null );
				} );
			} );

			describe( 'when the auth API throws an error', () => {
				it( 'throws the same error', async () => {
					expect.assertions( 1 );
					const error = new InvalidTokenRequestError( {
						code: 'unauthorized_client',
						httpStatus: 400,
						description: 'Unauthorized client'
					} );
					authApi.revokeAccessToken.mockRejectedValueOnce( error );
					const api = createApi();

					try {
						await api.revokeAccess();
					} catch ( thrownError ) {
						expect( thrownError ).toEqual( error );
					}
				} );
			} );
		} );
	} );

	describe( '@request', () => {
		const path = '/some/resource';
		const params = { include: [ 'nested1', 'nested2' ], metaparam: 25 };
		const data = { name: 'A resource', description: 'Test description', code: 42 };

		const successfulResponseData = { message: 'Request successful' };
		const successfulAxiosResponse = { data: successfulResponseData, status: 200 };
		const failedResponseData = { message: 'Resource not found' };
		const failedResponseStatus = 404;

		const mockRequestSuccessfulResponse = () => {
			axiosClientMock.request.mockResolvedValueOnce( successfulAxiosResponse );
		};

		const mockRequestFailedResponse = ( status = failedResponseStatus ) => {
			axiosClientMock.request.mockRejectedValueOnce( {
				response: { data: failedResponseData, status: status || failedResponseStatus }
			} );
		};

		const createApiAndMakeRequest = ( apiParams = {} ) => {
			const api = createApi( apiParams );

			return api.request( {
				method: 'post', path, params, data
			} );
		};

		const itThrowsAFailedResponseError = (
			{ apiParams, errorStatus }: { apiParams?: object, errorStatus?: number } = {}
		) => {
			it( 'throws a FailedResponseError with the response status and body', async () => {
				expect.assertions( 3 );
				mockRequestFailedResponse( errorStatus );

				try {
					await createApiAndMakeRequest( apiParams );
				} catch ( thrownError ) {
					expect( thrownError ).toBeInstanceOf( FailedResponseError );

					const error = thrownError as FailedResponseError;

					expect( error.data ).toEqual( failedResponseData );
					expect( error.status ).toEqual( errorStatus || failedResponseStatus );
				}
			} );
		};

		it( 'makes an HTTP request with the provided config', () => {
			mockRequestSuccessfulResponse();
			createApiAndMakeRequest( { accessTokenGetter: undefined } );

			expect( axiosClientMock.request ).toHaveBeenCalledWith( {
				method: 'post',
				url: path,
				params,
				headers: {},
				data
			} );
		} );

		describe( 'when the access token getter returns an access token', () => {
			it( 'sends the Authorization header with the token', () => {
				mockRequestSuccessfulResponse();
				createApiAndMakeRequest();

				expect( axiosClientMock.request ).toHaveBeenCalledWith(
					expect.objectContaining( {
						headers: { Authorization: `Bearer ${accessToken.token}` }
					} )
				);
			} );
		} );

		describe( 'when the request returns a successful response', () => {
			it( 'returns the response body', async () => {
				mockRequestSuccessfulResponse();
				const response = await createApiAndMakeRequest();

				expect( response ).toEqual( successfulResponseData );
			} );
		} );

		describe( 'when the request returns a failed response', () => {
			itThrowsAFailedResponseError();
		} );

		describe( 'when the request returns a failed response with status 401', () => {
			describe( 'and the current access token has an associated refresh token', () => {
				it( 'refreshes the access token with the auth API', async () => {
					mockRequestFailedResponse( 401 );
					mockRequestSuccessfulResponse();

					await createApiAndMakeRequest();

					expect( authApi.refreshAccessToken ).toHaveBeenCalledWith( { accessToken } );
				} );

				describe( 'when the refresh request is successful', () => {
					it( 'calls the onAccessTokenUpdated callback with the new token', async () => {
						mockRequestFailedResponse( 401 );
						mockRequestSuccessfulResponse();

						await createApiAndMakeRequest();

						expect( onAccessTokenUpdated ).toHaveBeenCalledWith( refreshedAccessToken );
					} );

					it( 'performs the request again', async () => {
						mockRequestFailedResponse( 401 );
						mockRequestSuccessfulResponse();

						await createApiAndMakeRequest();

						expect( axiosClientMock.request ).toHaveBeenCalledTimes( 2 );
					} );
				} );

				describe( 'when the refresh request throws an error', () => {
					const error = new Error( 'Unexpected error' );

					it( 'throws the same error', async () => {
						expect.assertions( 1 );
						mockRequestFailedResponse( 401 );
						authApi.refreshAccessToken.mockRejectedValue( error );

						try {
							await createApiAndMakeRequest();
						} catch ( thrownError ) {
							expect( thrownError ).toEqual( error );
						}
					} );
				} );
			} );

			describe( 'and the current access token has no associated refresh token', () => {
				itThrowsAFailedResponseError( {
					apiParams: {
						accessTokenGetter: () => ( { ...accessToken, refreshToken: null } )
					},
					errorStatus: 401
				} );
			} );
		} );

		describe( 'when the request fails to execute', () => {
			describe( 'and the error message is "Network Error"', () => {
				it( 'throws a NetworkError', async () => {
					expect.assertions( 2 );
					axiosClientMock.request.mockRejectedValue( new Error( 'Network Error' ) );
					const api = new Api( { baseUrl } );

					try {
						await api.request( { method: 'get', path } );
					} catch ( thrownError ) {
						expect( thrownError ).toBeInstanceOf( NetworkError );

						const error = thrownError as NetworkError;

						expect( error.message ).toEqual( 'Could not connect to remote server' );
					}
				} );
			} );

			describe( 'and the error message is not "Network Error"', () => {
				it( 'throws the same error', async () => {
					expect.assertions( 1 );
					const error = new Error( 'Unknown error' );
					axiosClientMock.request.mockRejectedValue( error );

					try {
						await createApiAndMakeRequest();
					} catch ( thrownError ) {
						expect( thrownError ).toEqual( error );
					}
				} );
			} );
		} );
	} );
} );
