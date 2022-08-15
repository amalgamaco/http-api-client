import { InvalidCredentialsError, InvalidTokenRequestError } from '../../src/errors';
import AuthApi from '../../src/AuthApi/AuthApi';
import { AccessToken } from '../../src/types';

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
		create: () => axiosClient,
		isAxiosError: () => true
	}
} ) );

describe( 'AuthApi', () => {
	const baseUrl = 'https://auth.server';
	const tokenEndpoint = '/oauth/token';
	const clientId = 'client id';
	const clientSecret = 'client secret';

	const createAuthApi = () => new AuthApi( {
		baseUrl, tokenEndpoint, clientId, clientSecret
	} );

	const itRequestsAnAccessToken = ( {
		action, withGrantType, withCredentials, errorClassForInvalidGrant, actionDescription
	}: ItRequestsAnAccessTokenParams ) => {
		const response = {
			access_token: 'xyz',
			token_type: 'bearer',
			expires_in: 300,
			refresh_token: 'abc'
		};
		const errorStatus = 400;
		const errorResponse = {
			error: 'unauthorized_client',
			error_description: 'A description'
		};

		const mockAccessTokenResponse = ( responseOverrides = {} ) => {
			axiosClient.post.mockResolvedValue( {
				status: 200,
				data: { ...response, ...responseOverrides }
			} );
		};

		const mockAccessTokenErrorResponse = ( status = errorStatus, responseOverrides = {} ) => {
			axiosClient.post.mockRejectedValue( {
				response: {
					status,
					data: { ...errorResponse, ...responseOverrides }
				}
			} );
		};

		const createApiAndRequestToken = () => {
			const authApi = createAuthApi();

			return action( authApi );
		};

		beforeEach( () => mockAccessTokenResponse() );

		it( actionDescription, () => {
			createApiAndRequestToken();

			expect( axiosClient.post ).toHaveBeenCalledWith(
				tokenEndpoint,
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

		describe( 'when the request returns a failed access token response', () => {
			describe( 'when the failed response has HTTP status 400 or 401', () => {
				const expectApiToThrowInvalidTokenRequestError = async (
					{ errorClass, errorCode = errorResponse.error }
					: { errorClass: unknown, errorCode?: string }
				) => {
					expect.assertions( 4 );

					try {
						await createApiAndRequestToken();
					} catch ( thrownError ) {
						expect( thrownError ).toBeInstanceOf( errorClass );

						const error = thrownError as InvalidTokenRequestError;

						expect( error.code ).toEqual( errorCode );
						expect( error.httpStatus ).toEqual( errorStatus );
						expect( error.description ).toEqual( errorResponse.error_description );
					}
				};

				it( 'throws an InvalidTokenRequestError with the returned code and description', async () => {
					mockAccessTokenErrorResponse();

					await expectApiToThrowInvalidTokenRequestError( {
						errorClass: InvalidTokenRequestError
					} );
				} );

				describe( 'and the error_code is invalid_grant', () => {
					it( `throws an ${errorClassForInvalidGrant} with the returned code and description`, async () => {
						mockAccessTokenErrorResponse( errorStatus, { error: 'invalid_grant' } );

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
					mockAccessTokenErrorResponse( 500 );

					try {
						await createApiAndRequestToken();
					} catch ( error ) {
						expect( error ).toBeInstanceOf( Error );
					}
				} );
			} );
		} );
	};

	afterEach( () => jest.clearAllMocks() );

	describe( '@requestAccessToken', () => {
		const credentials = { username: 'a_user', password: 'a_password' };

		itRequestsAnAccessToken( {
			action: authApi => authApi.requestAccessToken( { credentials } ),
			withGrantType: 'password',
			withCredentials: credentials,
			errorClassForInvalidGrant: InvalidCredentialsError,
			actionDescription: (
				'requests the token endpoint with the provided credentials following the OAuth2 spec'
			)
		} );
	} );

	describe( '@refreshAccessToken', () => {
		const accessToken = {
			token: 'a_token',
			type: 'bearer',
			expiresIn: 400,
			refreshToken: 'a_refresh_token'
		};

		itRequestsAnAccessToken( {
			action: authApi => authApi.refreshAccessToken( { accessToken } ),
			withGrantType: 'refresh_token',
			withCredentials: { refresh_token: accessToken.refreshToken },
			errorClassForInvalidGrant: InvalidTokenRequestError,
			actionDescription: (
				'requests the token endpoint with the refresh token associated to the given access token'
			)
		} );
	} );
} );