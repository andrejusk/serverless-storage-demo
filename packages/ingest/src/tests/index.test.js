require('mocha');
const chai = require('chai');
const sinon = require('sinon');
const supertest = require('supertest');

const { Storage } = require('@google-cloud/storage');

// Set up required environment
process.env.OUTPUT_BUCKET = "example-output";

const server = require('../index');

describe('PDF converter', () => {

    describe('service health checks', () => {
        it('API responds to health endpoint', async () => {
            const res = await supertest(server).get('/health').expect(200);
            chai.expect(res.body).to.deep.equal({
                hello: 'world',
            });
        });
    });

    describe('service handler', () => {
        const testData = {
            bucket: 'example-input',
            name: 'foobar'
        }

        before(() => {
            sinon.stub(Storage.prototype, 'bucket');
        });

        it('successfully runs', async () => {
            await supertest(server).post('/').send({
                message: {
                    data: Buffer.from(JSON.stringify(testData), 'binary').toString('base64')
                }
            }).expect(200);
        });
    });

});