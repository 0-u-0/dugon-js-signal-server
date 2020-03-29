const NATS = require('nats');

const ClientHub =  require('./libs/clientHub');
const MediaHub = require('./libs/mediaHub');


async function main() {
  const nc = NATS.connect();

  const mediaHub = new MediaHub();
  await mediaHub.init();

  const clientHub = new ClientHub(nc,mediaHub);
  clientHub.init();
}


main();