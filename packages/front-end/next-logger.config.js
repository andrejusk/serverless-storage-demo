const pino = require('pino')

// Change default message key,
// see https://www.npmjs.com/package/next-logger
const logger = defaultConfig =>
  pino({
    ...defaultConfig,
    messageKey: 'message',
    mixin: () => ({ name: 'custom-pino-instance' }),
  })

module.exports = {
  logger,
}
