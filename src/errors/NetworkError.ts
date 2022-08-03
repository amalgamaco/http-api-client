export default class NetworkError extends Error {
	constructor() {
		super( 'Could not connect to remote server' );
	}
}
