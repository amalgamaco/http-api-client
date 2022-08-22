import axios from 'axios';
import { InvalidCredentialsError, InvalidTokenRequestError } from '../../src/errors';
import AuthApi from '../../src/AuthApi/AuthApi';
import { AccessToken, AuthApiParams } from '../../src/types';

interface ItHandlesErrorsCorrectlyParams {
	forAction: () => Promise<unknown>,
	errorClassForInvalidGrant?: typeof InvalidTokenRequestError
}

interface ItHandlesAccessTokenResponseCorrectlyParams {
	action: () => Promise<AccessToken>,
	errorClassForInvalidGrant: typeof InvalidTokenRequestError
}

const axiosClient = {
	post: jest.fn()
};

jest.mock( 'axios', () => ( {
	...jest.requireActual( 'axios' ),
	__esModule: true,
	default: {
		create: jest.fn( () => axiosClient ),
		isAxiosError: () => true
	}
} ) );

describe( 'AuthApi', () => {
	const baseUrl = 'https://auth.server';
	const createTokenEndpoint = '/oauth/token';
	const revokeTokenEndpoint = '/oauth/revoke';
	const clientId = 'client id';
	const clientSecret = 'client secret';

	const buildAccessToken = () => ( {
		token: 'a_token',
		type: 'bearer',
		expiresIn: 400,
		refreshToken: 'a_refresh_token'
	} );

	const createAuthApi = ( params?: Partial<AuthApiParams> ) => new AuthApi( {
		baseUrl, createTokenEndpoint, revokeTokenEndpoint, clientId, clientSecret, ...params
	} );

	const itHandlesErrorsCorrectly = ( {
		forAction: action, errorClassForInvalidGrant = InvalidCredentialsError
	}: ItHandlesErrorsCorrectlyParams ) => {
		describe( 'when the request returns a failed response', () => {
			const errorStatus = 400;
			const errorResponse = {
				error: 'unauthorized_client',
				error_description: 'A description'
			};

			const mockErrorResponse = ( status = errorStatus, responseOverrides = {} ) => {
				axiosClient.post.mockRejectedValue( {
					response: {
						status,
						data: { ...errorResponse, ...responseOverrides }
					}
				} );
			};

			describe( 'when the failed response has HTTP status 400 or 401', () => {
				const expectApiToThrowInvalidTokenRequestError = async (
					{ errorClass, errorCode = errorResponse.error }
					: { errorClass: unknown, errorCode?: string }
				) => {
					expect.assertions( 4 );

					try {
						await action();
					} catch ( thrownError ) {
						expect( thrownError ).toBeInstanceOf( errorClass );

						const error = thrownError as InvalidTokenRequestError;

						expect( error.code ).toEqual( errorCode );
						expect( error.httpStatus ).toEqual( errorStatus );
						expect( error.description ).toEqual( errorResponse.error_description );
					}
				};

				it( 'throws an InvalidTokenRequestError with the returned code and description', async () => {
					mockErrorResponse();

					await expectApiToThrowInvalidTokenRequestError( {
						errorClass: InvalidTokenRequestError
					} );
				} );

				describe( 'and the error_code is invalid_grant', () => {
					it( `throws an ${errorClassForInvalidGrant.name} with the returned code and description`, async () => {
						mockErrorResponse( errorStatus, { error: 'invalid_grant' } );

						await expectApiToThrowInvalidTokenRequestError( {
							errorClass: errorClassForInvalidGrant,
							errorCode: 'invalid_grant'
						} );
					} );
				} );
			} );

			describe( 'when the failed response has another HTTP status', () => {
				it( 'throws an Error containing the status and body', async () => {
					expect.assertions( 1 );
					mockErrorResponse( 500 );

					try {
						await action();
					} catch ( error ) {
						expect( error ).toBeInstanceOf( Error );
					}
				} );
			} );
		} );
	};

	const itHandlesAccessTokenResponseCorrectly = ( {
		action, errorClassForInvalidGrant
	}: ItHandlesAccessTokenResponseCorrectlyParams ) => {
		const response = {
			access_token: 'xyz',
			token_type: 'bearer',
			expires_in: 300,
			refresh_token: 'abc'
		};

		const mockAccessTokenResponse = ( responseOverrides = {} ) => {
			axiosClient.post.mockResolvedValue( {
				status: 200,
				data: { ...response, ...responseOverrides }
			} );
		};

		beforeEach( () => mockAccessTokenResponse() );

		describe( 'when the request returns a successful access token response', () => {
			it( 'returns an AccessToken object built from the response', async () => {
				const accessToken = await action();

				expect( accessToken ).toEqual( {
					token: response.access_token,
					type: response.token_type,
					expiresIn: response.expires_in,
					refreshToken: response.refresh_token
				} );
			} );

			describe( 'when the response contains no expiration time', () => {
				it( 'returns an AccessToken object with null expiresIn', async () => {
					mockAccessTokenResponse( { expires_in: undefined } );

					const accessToken = await action();

					expect( accessToken.expiresIn ).toBeNull();
				} );
			} );

			describe( 'when the response contains no refresh token', () => {
				it( 'returns an AccessToken object with null refreshToken', async () => {
					mockAccessTokenResponse( { refresh_token: undefined } );

					const accessToken = await action();

					expect( accessToken.refreshToken ).toBeNull();
				} );
			} );
		} );

		itHandlesErrorsCorrectly( { forAction: action, errorClassForInvalidGrant } );
	};

	afterEach( () => jest.clearAllMocks() );

	describe( 'constructor', () => {
		it( 'creates an Axios client with the given base URL and client credenetials', () => {
			createAuthApi();

			expect( axios.create ).toHaveBeenCalledWith( {
				baseURL: baseUrl,
				auth: {
					username: clientId,
					password: clientSecret
				}
			} );
		} );
	} );

	describe( '@requestAccessToken', () => {
		const credentials = { some_external_token: 'a_token' };

		const expectRequestToHaveBeenMadeCorrectly = ( withGrantType: string ) => {
			expect( axiosClient.post ).toHaveBeenCalledWith(
				createTokenEndpoint,
				{ grant_type: withGrantType, ...credentials }
			);
		};

		it( 'requests the create token endpoint with the provided grant type and credentials', () => {
			createAuthApi().requestAccessToken( { grantType: 'assertion', credentials } );

			expectRequestToHaveBeenMadeCorrectly( 'assertion' );
		} );

		describe( 'when no grant type is specified', () => {
			it( 'makes the request with the grant type passed to the auth api constructor', () => {
				const api = createAuthApi( { defaultGrantType: 'a_default_grant_type' } );

				api.requestAccessToken( { credentials } );

				expectRequestToHaveBeenMadeCorrectly( 'a_default_grant_type' );
			} );
		} );

		itHandlesAccessTokenResponseCorrectly( {
			action: () => createAuthApi().requestAccessToken( { credentials } ),
			errorClassForInvalidGrant: InvalidCredentialsError
		} );
	} );

	describe( '@refreshAccessToken', () => {
		const accessToken = buildAccessToken();
		const refreshAccessToken = () => createAuthApi().refreshAccessToken( { accessToken } );

		it( 'requests the create token endpoint with the refresh token associated to the given access token', () => {
			refreshAccessToken();

			expect( axiosClient.post ).toHaveBeenCalledWith(
				createTokenEndpoint,
				{ grant_type: 'refresh_token', refresh_token: accessToken.refreshToken }
			);
		} );

		itHandlesAccessTokenResponseCorrectly( {
			action: refreshAccessToken,
			errorClassForInvalidGrant: InvalidTokenRequestError
		} );
	} );

	describe( '@revokeAccessToken', () => {
		const accessToken = buildAccessToken();

		beforeEach( () => {
			axiosClient.post.mockResolvedValue( {
				status: 200,
				data: null
			} );
		} );

		const createApiAndRevokeToken = () => {
			const api = createAuthApi();

			return api.revokeAccessToken( accessToken );
		};

		it( 'requests the revoke token endpoint passing the given access token', () => {
			createApiAndRevokeToken();

			expect( axiosClient.post ).toHaveBeenCalledWith(
				revokeTokenEndpoint,
				undefined,
				{ params: { token: accessToken.token } }
			);
		} );

		describe( 'when the request is successful', () => {
			it( 'resolves the promise', async () => {
				await expect( createApiAndRevokeToken() ).resolves.not.toThrow();
			} );
		} );

		itHandlesErrorsCorrectly( { forAction: createApiAndRevokeToken } );
	} );
} );
