const NATS = require('nats');

const Hub = require('./libs/hub');

const Config = require('./config');

async function main() {
  const nc = NATS.connect({ servers: Config.nats });

  let hub;
  if (Config.https) {
    hub = new Hub(Config.port, nc, Config.cert);
  } else {
    hub = new Hub(Config.port, nc);
  }

  hub.init();
}


main();