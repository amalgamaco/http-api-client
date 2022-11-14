import { btoa } from 'js-base64';

export const basicAuthHeader = ( username: string, password: string ) => {
	const credentials = btoa( `${username}:${password}` );
	return { Authorization: `Basic ${credentials}` };
};
