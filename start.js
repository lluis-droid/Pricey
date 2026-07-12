if (!process.env.SESSION_SECRET) {
  console.error('[FATAL] SESSION_SECRET environment variable is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
if (!process.env.PRICEY_INTERNAL_SECRET) {
  const crypto = require('crypto');
  process.env.PRICEY_INTERNAL_SECRET = crypto.randomBytes(32).toString('hex');
  console.log('[STARTUP] No PRICEY_INTERNAL_SECRET set — generated a random one for this session.');
  console.log('[STARTUP] To persist it, add PRICEY_INTERNAL_SECRET to your .env file.');
}
require('./server.js');
require('./index.js');