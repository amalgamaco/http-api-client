import { serializeRequestDataForContentType } from '../../src/Api/utils';

describe( 'serializeRequestDataForContentType', () => {
	const data = {
		firstName: 'John',
		lastName: 'Doe',
		age: 33,
		friendsIds: [ 3, 5 ],
		relation: undefined
	};

	describe( 'when the request has content type application/json', () => {
		it( 'serializes the data as json', () => {
			const result = serializeRequestDataForContentType(
				data,
				{ 'Content-Type': 'application/json' }
			);

			expect( result ).toEqual( JSON.stringify( data ) );
		} );
	} );

	describe( 'when the request has content type multipart/form-data', () => {
		it( 'serializes the data as form data correctly', () => {
			const result = serializeRequestDataForContentType(
				data,
				{ 'Content-Type': 'multipart/form-data' }
			) as any;

			expect( result.append ).toHaveBeenCalledWith( 'firstName', data.firstName );
			expect( result.append ).toHaveBeenCalledWith( 'lastName', data.lastName );
			expect( result.append ).toHaveBeenCalledWith( 'age', data.age );

			// Lists values
			expect( result.append ).toHaveBeenCalledWith( 'friendsIds[]', 3 );
			expect( result.append ).toHaveBeenCalledWith( 'friendsIds[]', 5 );

			// Undefined values
			expect( result.append ).not.toHaveBeenCalledWith( 'relation', data.relation );
		} );
	} );
} );
