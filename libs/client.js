const MediaHub = require('./mediaHub');

const crypto = require('crypto');


function idGenerator(sessionId, tokenId, role) {
  return crypto.createHash('md5').update(`${sessionId}@${tokenId}@${role}`).digest('hex');
}

class Client {
  /**
   * 
   * @param {*} ws 
   * @param {*} nc 
   * @param {MediaHub} mediaHub 
   * @param {*} sessionId 
   * @param {*} tokenId 
   */
  constructor(ws, nc, mediaHub, sessionId, tokenId) {
    this.ws = ws;
    this.nc = nc;
    this.mediaHub = mediaHub;
    this.mediaHub = mediaHub;
    this.sessionId = sessionId;
    this.tokenId = tokenId;

    //NATS subscriber id
    this.sessionSid = null;
    this.oneSid = null;

    // event
    this.ondisconnect = null;
  }

  init() {

    this.ws.on('message', async msg => {
      this.handleClientMsg(msg);
    });

    this.ws.on('close', event => {
      this.ondisconnect();
      this.release();
    });
  }

  release() {
    //NATS release
    this.nc.unsubscribe(this.sessionSid);
    this.nc.unsubscribe(this.oneSid);

    //Media release
    //TODO:

    //Client notification
    this.pub2Session('leave');
  }


  /* --------  Client  ---------*/
  async handleClientMsg(msg) {
    let jsonMsg = JSON.parse(msg);
    let { id, method, params } = jsonMsg;
    console.log(`client message: `, jsonMsg);

    if (method === 'request') {
      const { event, data } = params;
      this.handleClientRequest(id, event, data);
    }
  }

  async handleClientRequest(requestId, event, data) {
    switch (event) {
      case 'join': {
        this.subscribe();
        this.pub2Session('join');

        this.response(requestId);

        break;
      }
      case 'transport': {
        const { role } = data;

        const transportId = idGenerator(this.sessionId, this.tokenId, role);

        if (!this.mediaHub.transports.has(transportId)) {
          const transport = await this.mediaHub.createTransport(transportId, role);
          this.response(requestId, {
            'transportParameters': transport.transportParameters
          });
        } else {
          //TODO: error
        }

        break;
      }
      case 'dtls': {

        const { transportId, dtlsParameters } = data;
        const transport = this.mediaHub.transports.get(transportId);
        if (transport) {
          await transport.setDtlsParameters(dtlsParameters)
          this.response(requestId);

        } else {
          //TODO: error
        }

        break;
      }
      case 'produce': {
        const { transportId, kind, rtpParameters, localId, metadata } = data;

        const publisher = this.mediaHub.transports.get(transportId);
        if (publisher) {
          const producerId = await publisher.produce(kind, rtpParameters, metadata);
          this.response(requestId, {
            producerId,
            localId
          });

          //TODO: broadcast producer
          this.pub2Session('produce', {
            producerId,
            metadata
          });
        }
        break;
      }
      case 'consume': {
        const { tokenId, producerId, transportId } = data;

        const subscriber = this.mediaHub.transports.get(transportId);
        if (subscriber) {
          const consumerParameters = await subscriber.consume(producerId);
          this.response(requestId, {
            ...consumerParameters,
            producerId
          })
        }

      }

    }
  }

  //to client
  response(id, params = {}) {
    this.sendJSON({
      'method': 'response',
      id, params
    });
  }

  //to client
  notification(params) {
    this.sendJSON({
      'method': 'notification',
      params
    });
  }


  sendJSON(json) {
    try {
      let jsonString = JSON.stringify(json);
      this.ws.send(jsonString);
    } catch (e) {
      // TODO:
    }
  }

  /* -------  NATS  --------- */
  handleOneMsg(msg) {
    let jsonMsg = JSON.parse(msg);
    let { tokenId, method, data } = jsonMsg;
    console.log(`individual message: ${tokenId} -> ${this.tokenId} `, jsonMsg);

    if (method === 'join') {

      this.notification({
        event: 'join',
        data: {
          tokenId
        }
      });
      //TODO: producer
      const transportId = idGenerator(this.sessionId, this.tokenId, 'pub');
      const publisher = this.mediaHub.transports.get(transportId);
      if (publisher) {
        publisher.producers.forEach((producer, producerId) => {
          this.pub2One(tokenId, 'produce', {
            producerId,
            metadata: producer.appData
          });
        })
      }

    } else if (method === 'produce') {
      const { producerId, metadata } = data;
      this.notification({
        'event': 'produce',
        'data': {
          producerId,
          tokenId,
          metadata
        }
      });
    }

  }

  handleSessionMsg(msg) {
    let jsonMsg = JSON.parse(msg);
    let { tokenId, method, data } = jsonMsg;
    if (tokenId != this.tokenId) {
      console.log(`session message: ${tokenId} -> ${this.tokenId}`, jsonMsg);
      if (method === 'join') {
        this.notification({
          event: 'join',
          data: {
            tokenId
          }
        });

        this.pub2One(tokenId, 'join');
        //TODO: producer
        const transportId = idGenerator(this.sessionId, this.tokenId, 'pub');
        const publisher = this.mediaHub.transports.get(transportId);
        if (publisher) {
          publisher.producers.forEach((producer, producerId) => {
            this.pub2One(tokenId, 'produce', {
              producerId,
              metadata: producer.appData
            });
          })
        }

      } else if (method === 'leave') {
        this.notification({
          event: 'leave',
          data: {
            tokenId
          }
        });
      } else if (method === 'produce') {
        const { producerId, metadata } = data;
        this.notification({
          'event': 'produce',
          'data': {
            producerId,
            tokenId,
            metadata
          }
        });
      }
    }
  }

  //subscribe NATS
  subscribe() {
    this.oneSid = this.nc.subscribe(`${this.sessionId}.${this.tokenId}`, msg => {
      this.handleOneMsg(msg);
    });

    this.sessionSid = this.nc.subscribe(`${this.sessionId}.@`, msg => {
      this.handleSessionMsg(msg);
    });
  }


  pub2Session(method, data = {}) {
    this.nc.publish(`${this.sessionId}.@`, JSON.stringify({
      tokenId: this.tokenId,
      method, data
    }));
  }

  pub2One(tokenId, method, data = {}) {
    this.nc.publish(`${this.sessionId}.${tokenId}`, JSON.stringify({
      tokenId: this.tokenId,
      method, data
    }));

  }


}

module.exports = Client;