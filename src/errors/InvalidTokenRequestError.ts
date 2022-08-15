export interface InvalidTokenRequestErrorParams {
	code?: string,
	httpStatus: number,
	description?: string
}

const errorMessage = ( { code, httpStatus, description }: InvalidTokenRequestErrorParams ) => (
	'Invalid token request. '
	+ `Error code: ${code || 'none'}, HTTP status code: ${httpStatus}, `
	+ `description: ${description || 'none'}.`
);

export default class InvalidTokenRequestError extends Error {
	code?: string;
	httpStatus: number;
	description?: string;

	constructor( { code, httpStatus, description }: InvalidTokenRequestErrorParams ) {
		super( errorMessage( { code, httpStatus, description } ) );

		this.code = code;
		this.httpStatus = httpStatus;
		this.description = description;
	}
}
