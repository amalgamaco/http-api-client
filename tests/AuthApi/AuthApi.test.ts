import axios from 'axios';
import { InvalidCredentialsError, InvalidTokenRequestError } from '../../src/errors';
import AuthApi from '../../src/AuthApi/AuthApi';
import { AccessToken } from '../../src/types';

interface ItHandlesErrorsCorrectlyParams {
	forAction: () => Promise<unknown>,
	errorClassForInvalidGrant?: typeof InvalidTokenRequestError
}

interface ItRequestsAnAccessTokenParams {
	action: ( authApi: AuthApi ) => Promise<AccessToken>,
	withGrantType: string,
	withCredentials: Record<string, string>,
	errorClassForInvalidGrant: typeof InvalidTokenRequestError,
	actionDescription: string
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

	const createAuthApi = () => new AuthApi( {
		baseUrl, createTokenEndpoint, revokeTokenEndpoint, clientId, clientSecret
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

	const itRequestsAnAccessToken = ( {
		action, withGrantType, withCredentials, errorClassForInvalidGrant, actionDescription
	}: ItRequestsAnAccessTokenParams ) => {
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

		const createApiAndRequestToken = () => {
			const authApi = createAuthApi();

			return action( authApi );
		};

		beforeEach( () => mockAccessTokenResponse() );
		afterEach( () => jest.clearAllMocks() );

		it( actionDescription, () => {
			createApiAndRequestToken();

			expect( axiosClient.post ).toHaveBeenCalledWith(
				createTokenEndpoint,
				{ grant_type: withGrantType, ...withCredentials }
			);
		} );

		describe( 'when the request returns a successful access token response', () => {
			it( 'returns an AccessToken object built from the response', async () => {
				const accessToken = await createApiAndRequestToken();

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

					const accessToken = await createApiAndRequestToken();

					expect( accessToken.expiresIn ).toBeNull();
				} );
			} );

			describe( 'when the response contains no refresh token', () => {
				it( 'returns an AccessToken object with null refreshToken', async () => {
					mockAccessTokenResponse( { refresh_token: undefined } );

					const accessToken = await createApiAndRequestToken();

					expect( accessToken.refreshToken ).toBeNull();
				} );
			} );
		} );

		itHandlesErrorsCorrectly( { forAction: createApiAndRequestToken, errorClassForInvalidGrant } );
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
		const credentials = { username: 'a_user', password: 'a_password' };

		itRequestsAnAccessToken( {
			action: authApi => authApi.requestAccessToken( { credentials } ),
			withGrantType: 'password',
			withCredentials: credentials,
			errorClassForInvalidGrant: InvalidCredentialsError,
			actionDescription: (
				'requests the create token endpoint with the provided credentials following the OAuth2 spec'
			)
		} );
	} );

	describe( '@refreshAccessToken', () => {
		const accessToken = buildAccessToken();

		itRequestsAnAccessToken( {
			action: authApi => authApi.refreshAccessToken( { accessToken } ),
			withGrantType: 'refresh_token',
			withCredentials: { refresh_token: accessToken.refreshToken },
			errorClassForInvalidGrant: InvalidTokenRequestError,
			actionDescription: (
				'requests the create token endpoint with the refresh token associated to the given access token'
			)
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
