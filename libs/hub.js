
const URL = require('url');
const WebSocket = require('ws');
const Client = require('./client');


class Hub {
  constructor(nc) {
    this.nc = nc;
    this.port = 8800;
    this.wss = null;
    this.clients = [];
  }

  init() {
    this.wss = new WebSocket.Server({ port: this.port });
    console.log(`ws on port ${this.port}`)
    this.wss.on('connection', (ws, request) => {
      console.log(request.url);
      let urlObj = URL.parse(request.url, true);
      let sessionId = urlObj.query['sessionId'];
      let tokenId = urlObj.query['tokenId'];

      const client = new Client(ws, this.nc, sessionId, tokenId);
      client.ondisconnect = _ => {
        const index = this.clients.indexOf(client);
        if (index > -1) {
          this.clients.splice(index, 1);
        }

      };

      client.init();
      //TODO: delete when websocket closed
      this.clients.push(client);

    });
  }
}

module.exports = Hub;