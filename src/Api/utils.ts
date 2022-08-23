import { AxiosRequestHeaders } from 'axios';
import { RequestData } from '../types';

const serializeDataAsFormData = ( data: RequestData ): FormData => Object
	.keys( data )
	.reduce(
		( result, property ) => {
			const value = data[ property ];
			if ( value === undefined || value === null ) { return result; }

			if ( Array.isArray( value ) ) {
				value.forEach(
					item => result.append( `${property}[]`, item )
				);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				result.append( property, value as any );
			}

			return result;
		},
		new FormData()
	);

export const serializeRequestDataForContentType = (
	data: RequestData, headers?: AxiosRequestHeaders
): string | FormData => (
	headers && headers[ 'Content-Type' ] === 'multipart/form-data'
		? serializeDataAsFormData( data )
		: JSON.stringify( data )
);
