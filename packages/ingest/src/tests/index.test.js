require("mocha");
const chai = require("chai");
const fs = require("fs");
const sinon = require("sinon");
const supertest = require("supertest");

const { Bucket, File } = require("@google-cloud/storage");
const { Topic } = require("@google-cloud/pubsub");

// Set up required environment
process.env.OUTPUT_BUCKET = "example-bucket";
process.env.OUTPUT_PREFIX = "/example";
process.env.OUTPUT_TOPIC = "example-topic";

const server = require("../index");

describe("File ingest service", () => {
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
  // Note: a local copy of `clamav` is a requirement for this TC,
  // make sure `freshclam` has been run, and the daemon is running
  describe("service handler", () => {
    // Local file stub
    const fileName = "foobar.txt";
    const testPath = `/tmp/${fileName}`;

    // Sample parts of message data object
    const testData = {
      bucket: "example-input",
      name: fileName,
    };

    // Local test "virus" file stub
    // See https://secure.eicar.org/eicar.com.txt
    const badData =
      "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    const badFileName = "bad.txt";
    const badPath = `/tmp/${badFileName}`;

    const testBadData = {
      bucket: "example-input",
      name: badFileName,
    };

    // Google Cloud method stubs
    let fileDeleteStub;
    let fileDownloadStub;
    let bucketUploadStub;
    let topicPublishStub;

    beforeEach(() => {
      // Prevent Google Cloud API calls
      fileDeleteStub = sinon.stub(File.prototype, "delete");
      fileDownloadStub = sinon.stub(File.prototype, "download");
      bucketUploadStub = sinon.stub(Bucket.prototype, "upload");
      topicPublishStub = sinon.stub(Topic.prototype, "publishMessage");

      // Create sample local file(s) to get virus scanned
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFileSync(testPath, "sample text", "utf8");
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      fs.writeFileSync(badPath, badData, "utf8");
    });
    afterEach(() => {
      // Clean up after tests
      fileDeleteStub.restore();
      fileDownloadStub.restore();
      bucketUploadStub.restore();
      topicPublishStub.restore();
    });

    it("successfully runs", async () => {
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

      // Make sure we upload good files, not delete them
      const uploads = bucketUploadStub.getCalls();
      chai.expect(uploads.length).greaterThan(0);
      chai.expect(uploads.length).lessThan(2);
      const deletes = fileDeleteStub.getCalls();
      chai.expect(deletes.length).lessThanOrEqual(0);

      // Assert expected PubSub calls are made
      const messages = topicPublishStub.getCalls();
      chai.expect(messages.length).greaterThan(0);
      chai.expect(messages.length).lessThan(2);
    }).timeout(5000);

    it("successfully rejects", async () => {
      await supertest(server)
        .post("/")
        .send({
          message: {
            data: Buffer.from(JSON.stringify(testBadData), "binary").toString(
              "base64"
            ),
          },
        })
        .expect(200);

      // Assert expected Cloud Storage calls are made
      const downloads = fileDownloadStub.getCalls();
      chai.expect(downloads.length).greaterThan(0);
      chai.expect(downloads.length).lessThan(2);

      // Make sure we don't upload viruses, instead delete them
      const uploads = bucketUploadStub.getCalls();
      chai.expect(uploads.length).lessThanOrEqual(0);
      const deletes = fileDeleteStub.getCalls();
      chai.expect(deletes.length).greaterThan(0);
      chai.expect(deletes.length).lessThan(2);

      // Assert expected PubSub calls are made
      const messages = topicPublishStub.getCalls();
      chai.expect(messages.length).greaterThan(0);
      chai.expect(messages.length).lessThan(2);
    }).timeout(5000);
  });
});
