const { promisify } = require('util');
const { Storage } = require('@google-cloud/storage');
const exec = promisify(require('child_process').exec);
const express = require('express');
const bodyParser = require('body-parser');

const storage = new Storage();

const DEFAULT_PORT = 3002;

// TODO check for pubsub announce topic(s)
if (!process.env.PDF_BUCKET) throw 'PDF_BUCKET not set';

// Create service
const app = express();
module.exports = app;

// Accept JSON
app.use(bodyParser.json());

// Handle health check
app.get('/health', (_, res) => {
    res.status(200).json({ hello: 'world' });
});

// Handle new file ingest controller
app.post('/', async (req, res) => {
    const { message } = req.body;
    // console.log('Handling event', { message });

    const { data: rawData } = message.data;
    const file = JSON.parse(Buffer.from(rawData, 'base64').toString());
    const { bucket, name } = file;
    // console.log(`Converting 'gs://${bucket}/${name}' to PDF...`, { file });

    const fileName = `${Date.now()}-${name}`;
    const destination = `/tmp/${fileName}`;
    // console.log(`Saving to '${destination}'...`);
    await storage.bucket(bucket).file(name).download({ destination });

    try {
        const pdfFileName = await convertFile(fileName);
        await storage.bucket(process.env.PDF_BUCKET).upload(`/tmp/${pdfFileName}`);

        // TODO announce processed file
        res.status(200).json({});
    } catch {
        // TODO announce failure in proccessing
        res.status(200).json({});
    }
});

const errHandler = (err, _, res, __) => {
    console.error(`Internal error: '${err.message}'`, { err });
    res
      .status(500)
      .json({ message: 'Internal server error' });
  };
app.use(errHandler);

async function convertFile(fileName) {
    const cmd = 'libreoffice --headless --convert-to pdf --outdir /tmp ""' +
        `"/tmp/${fileName}"`;
    console.log(cmd);
    const { stdout, stderr } = await exec(cmd);
    if (stderr) {
        throw stderr;
    }
    console.log(stdout);
    return filePath.replace(/\.\w+$/, '.pdf');
}

if (require.main === module) {
    const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
    app.listen(port, () => {
        console.log('Listening on port', port);
    });
}
