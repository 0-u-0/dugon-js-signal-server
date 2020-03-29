const MediaHub = require('./mediaHub');

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

    this.sessionSid = null;
    this.oneSid = null;
  }

  init() {

    this.ws.on('message', async msg => {
      this.handleClientMsg(msg);
    });

    this.ws.on('close', event => {
      // TODO: 
      this.release();
    });
  }

  release() {
    this.nc.unsubscribe(this.sessionSid);
    this.nc.unsubscribe(this.oneSid);

    this.pub2Session('leave');
  }


  /* --------  Client  ---------*/
  async handleClientMsg(msg) {
    let jsonMsg = JSON.parse(msg);
    let { id, method, params } = jsonMsg;
    console.log(`client message: `, jsonMsg);

    if (method === 'request') {
      const { event, data } = params;
      if (event === 'join') {
        this.subscribe();
        this.pub2Session('join');

        this.response(id);
      } else if (event === 'createPublishTransport') {
        //
        const publishTransport = await this.mediaHub.createPublishTransport(this.tokenId);
        this.response(id, {
          'transportParameters': publishTransport.transportParameters
        })
      } else if (event === 'publishDtls') {
        const publishTransport = this.mediaHub.publishTransports.get(this.tokenId);
        if (publishTransport) {
          const { dtlsParameters } = data;
          await publishTransport.setDtlsParameters(dtlsParameters)
        }
        this.response(id);
      } else if (event === 'produce') {
        const publishTransport = this.mediaHub.publishTransports.get(this.tokenId);
        if (publishTransport) {
          const { kind, rtpParameters, localId } = data;
          const producerId = await publishTransport.produce(kind, rtpParameters);
          this.response(id, {
            producerId,
            localId
          });

          //TODO: broadcast producer
          this.pub2Session('produce', {
            producerId
          });
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
      const publishTransport = this.mediaHub.publishTransports.get(this.tokenId);
      if (publishTransport) {
        publishTransport.producers.forEach((v, producerId) => {
          this.pub2One(tokenId, 'produce', {
            producerId
          });
        })
      }

    } else if (method === 'produce') {
      const { producerId } = data;
      this.notification({
        'event': 'produce',
        producerId,
        tokenId
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
        const publishTransport = this.mediaHub.publishTransports.get(this.tokenId);
        if (publishTransport) {
          publishTransport.producers.forEach((v, producerId) => {
            this.pub2One(tokenId, 'produce', {
              producerId
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
        const { producerId } = data;
        this.notification({
          'event': 'produce',
          producerId,
          tokenId
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