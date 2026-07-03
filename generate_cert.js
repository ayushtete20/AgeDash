const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const certPath = path.join(__dirname, 'cert.pem');
const keyPath = path.join(__dirname, 'key.pem');

async function getHttpsOptions() {
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.log('Generating new self-signed certificate for localhost...');
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });
    fs.writeFileSync(certPath, pems.cert);
    fs.writeFileSync(keyPath, pems.private);
    console.log('Certificate generated.');
  }

  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
}

module.exports = getHttpsOptions;
