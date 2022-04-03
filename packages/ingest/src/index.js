const { Storage } = require('@google-cloud/storage');
const express = require('express');
const bodyParser = require('body-parser');

const storage = new Storage();

const app = express();

module.exports = app;

const DEFAULT_PORT = 3001;

app.use(bodyParser.json());

// Handle health check
app.get('/health', (_, res) => {
    res.status(200).json({ hello: 'world' });
});

app.post('/', async (req, res) => {
    try {
        const file = JSON.parse(Buffer.from(req.message.data, 'base64').toString());
        const options = { destination: `/tmp/${file.name}` };
        await storage.bucket(file.bucket).file(file.name).download(options);
        // TODO run checks, e.g. https://www.npmjs.com/package/clamscan
        await storage.bucket(process.env.OUTPUT_BUCKET).upload(options.destination);
        // TODO notify output topic
    }
    catch (ex) {
        console.log(`Error: ${ex}`);
    }
    res.set('Content-Type', 'text/plain');
    res.send('\n\nOK\n\n');
})

if (require.main === module) {
    const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
    app.listen(port, () => {
        console.log('Listening on port', port);
    });
}
