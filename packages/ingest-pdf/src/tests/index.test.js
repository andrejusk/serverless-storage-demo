require("mocha");
const chai = require("chai");
const fs = require("fs");
const sinon = require("sinon");
const supertest = require("supertest");

const { Bucket, File } = require("@google-cloud/storage");
const { Topic } = require("@google-cloud/pubsub");

// Set up expected environment
process.env.OUTPUT_BUCKET = "example-bucket";
process.env.OUTPUT_PREFIX = "/example";
process.env.OUTPUT_TOPIC = "example-topic";

const server = require("../index");

describe("PDF converter service", () => {
  // Make sure service uptime can be queried
  describe("service health checks", () => {
    it("API responds to health endpoint", async () => {
      const res = await supertest(server).get("/health").expect(200);
      chai.expect(res.body).to.deep.equal({
        hello: "world",
      });
    });
  });

  // Make sure service supports expected interface
  // Note: a local copy of `libreoffice` is a requirement for this TC
  describe("service handler", () => {
    // Local file stub
    const fileName = "foobar.txt";
    const testPath = `/tmp/${fileName}`;

    // Sample parts of message data object
    const testData = {
      bucket: "example-input",
      name: fileName,
    };

    // Google Cloud method stubs
    let fileDownloadStub;
    let bucketUploadStub;
    let topicPublishStub;

    before(() => {
      // Prevent Google Cloud API calls
      fileDownloadStub = sinon.stub(File.prototype, "download");
      bucketUploadStub = sinon.stub(Bucket.prototype, "upload");
      topicPublishStub = sinon.stub(Topic.prototype, "publishMessage");

      // Create sample local file to get converted to PDF
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFileSync(testPath, "sample text", "utf8");
    });
    after(() => {
      // Clean up after tests
      fileDownloadStub.restore();
      bucketUploadStub.restore();
      topicPublishStub.restore();
    });

    it("successfully runs", async () => {
      // Invoke API with sample payload
      await supertest(server)
        .post("/")
        .send({
          message: {
            data: Buffer.from(JSON.stringify(testData), "binary").toString(
              "base64"
            ),
          },
        })
        .expect(200);

      // Assert expected Cloud Storage calls are made
      const downloads = fileDownloadStub.getCalls();
      chai.expect(downloads.length).greaterThan(0);
      chai.expect(downloads.length).lessThan(2);

      const uploads = bucketUploadStub.getCalls();
      chai.expect(uploads.length).greaterThan(0);
      chai.expect(uploads.length).lessThan(2);

      // Assert expected PubSub calls are made
      const messages = topicPublishStub.getCalls();
      chai.expect(messages.length).greaterThan(0);
      chai.expect(messages.length).lessThan(2);
    }).timeout(5000); // Increased delay due to sub-process call delays
  });
});
