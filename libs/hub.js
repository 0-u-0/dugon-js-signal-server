
const fs = require('fs');
const URL = require('url');
const WebSocket = require('ws');
const Client = require('./client');

function atob(str) {
  return Buffer.from(str, 'base64').toString('binary');
}


class Hub {
  constructor(port, nc, cert) {
    this.nc = nc;
    this.port = port;
    this.wss = null;
    this.clients = [];
    this.cert = cert;
  }

  init() {
    let server;
    if (this.cert) {
      const https = require('https');
      let options = {
        key: fs.readFileSync(this.cert.key),
        cert: fs.readFileSync(this.cert.cert)
      };

      server = https.createServer(options);
    } else {
      const http = require('http');
      server = http.createServer();
    }

    server.listen(this.port);

    this.wss = new WebSocket.Server({ server });
    console.log(`ws on port ${this.port}`)
    this.wss.on('connection', (ws, request) => {
      console.log('connection');
      console.log(request.url);
      const urlObj = URL.parse(request.url, true);
      const params = urlObj.query['params'];

      if (params){
        const { sessionId, tokenId, metadata } = JSON.parse(atob(params))

        console.log(sessionId, tokenId, metadata);

        const client = new Client(ws, this.nc, String(sessionId), String(tokenId), metadata);
        client.ondisconnect = _ => {
          const index = this.clients.indexOf(client);
          if (index > -1) {
            this.clients.splice(index, 1);
          }
        };

        client.init();
        //TODO: delete when websocket closed
        this.clients.push(client);
      }else{
        //TODO: 
      }

      

    });
  }
}

module.exports = Hub;