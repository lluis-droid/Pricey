if (!process.env.PRICEY_INTERNAL_SECRET) {
  const crypto = require('crypto');
  process.env.PRICEY_INTERNAL_SECRET = crypto.randomBytes(32).toString('hex');
  console.log('[STARTUP] No PRICEY_INTERNAL_SECRET set — generated a random one for this session.');
  console.log('[STARTUP] To persist it, add PRICEY_INTERNAL_SECRET to your .env file.');
}
require('./server.js');
require('./index.js');