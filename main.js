const NATS = require('nats');

const Hub =  require('./libs/hub');


async function main() {
  const nc = NATS.connect();

  const hub = new Hub(nc);
  hub.init();
}


main();