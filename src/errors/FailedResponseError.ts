import { ApiResponse } from '../types';

export interface FailedResponseErrorParams {
	data: ApiResponse,
	status: number
}

export default class FailedResponseError extends Error {
	data: ApiResponse;
	status: number;

	constructor( { data, status }: FailedResponseErrorParams ) {
		super(
			`Received ${status} response from API. Response data: ${JSON.stringify( data ) || 'none'}`
		);

		this.data = data;
		this.status = status;
	}
}
