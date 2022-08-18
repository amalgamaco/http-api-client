import NetworkError from './NetworkError';

export { default as FailedResponseError } from './FailedResponseError';
export { default as InvalidCredentialsError } from './InvalidCredentialsError';
export { default as InvalidTokenRequestError } from './InvalidTokenRequestError';

export const networkError = () => new NetworkError();

export const noRefreshTokenError = () => new Error(
	'Cannot refresh an access token that has no associated refresh token'
);

export const unexpectedTokenResponseError = () => new Error(
	'Received unexpected access token response from authorization server'
);

export const unexpectedFailedResponseMessage = ( status: number, data: unknown ) => new Error(
	'Received unexpected failed response for access token request. '
	+ `Status: ${status}, data: ${data}`
);

export const missingAuthApiError = () => new Error(
	'Authentication parameters through the parameter \'authParams\' must be supplied '
	+ 'in the client constructor in order for the \'authenticate\' and \'revokeAccess\' '
	+ 'methods to work.'
);
