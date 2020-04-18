const crypto = require('crypto');


function idGenerator(sessionId, tokenId, role) {
  return crypto.createHash('md5').update(`${sessionId}@${tokenId}@${role}`).digest('hex');
}

class Client {
  /**
   * 
   * @param {*} ws 
   * @param {*} nc 
   * @param {*} sessionId 
   * @param {*} tokenId 
   */
  constructor(ws, nc, sessionId, tokenId, metadata) {
    this.ws = ws;
    this.nc = nc;
    this.sessionId = sessionId;
    this.tokenId = tokenId;
    this.metadata = metadata;

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


    //Client notification
    this.pub2Session('leave');

    //Media release
    this.requestMedia('close', {
      transportId: idGenerator(this.sessionId, this.tokenId, 'pub')
    });

    this.requestMedia('close', {
      transportId: idGenerator(this.sessionId, this.tokenId, 'sub')
    });

  }


  /* --------  Client  ---------*/
  async handleClientMsg(msg) {
    //TODO: json decode error
    let jsonMsg = JSON.parse(msg);
    let { id, method, params } = jsonMsg;
    console.log(`client message: `, jsonMsg);

    if (method === 'request') {
      const { event, data } = params;
      this.handleClientRequest(id, event, data);
    }
  }

  requestMedia(method, params = {}) {
    const requestMsg = JSON.stringify({
      method,
      params
    })
    return new Promise((y, n) => {
      this.nc.request(`media@`, requestMsg, (responseMsg) => {
        const { type, data } = JSON.parse(responseMsg);

        console.log(responseMsg);
        if (type === 'response') {
          y(data);
        } else {
          //TODO: error
        }
      })
    })
  }

  async handleClientRequest(requestId, event, data) {
    switch (event) {
      case 'join': {
        const { pub, sub } = data;

        const responseMsg = {};
        if (pub) {
          const transportId = idGenerator(this.sessionId, this.tokenId, 'pub');

          const { transportParameters } = await this.requestMedia('transport', {
            transportId,
            role: 'pub'
          });

          responseMsg.pub = transportParameters;
        }
        if (sub) {
          const transportId = idGenerator(this.sessionId, this.tokenId, 'sub');

          const { transportParameters } = await this.requestMedia('transport', {
            transportId,
            role: 'sub'
          });
          responseMsg.sub = transportParameters;
        }

        this.response(requestId, {
          ...responseMsg
        });

        this.subscribeNats();
        this.pub2Session('join', {
          metadata: this.metadata
        });

        break;
      }
      case 'dtls': {

        const { transportId, dtlsParameters } = data;
        await this.requestMedia('dtls', {
          transportId, dtlsParameters
        });

        this.response(requestId);

        break;
      }
      case 'publish': {
        const { transportId, kind, rtpParameters, metadata } = data;

        const { senderId } = await this.requestMedia('publish', {
          transportId, kind, rtpParameters, metadata
        });

        this.response(requestId, {
          senderId
        });

        this.pub2Session('publish', {
          senderId,
          metadata
        });
        break;
      }
      case 'unpublish': {
        const { transportId, senderId } = data;

        await this.requestMedia('unpublish', {
          transportId,
          senderId
        })
        this.response(requestId);

        //TODO: broadcast
        this.pub2Session('unpublish', {
          senderId
        })

        break;
      }
      case 'subscribe': {
        // const { tokenId, producerId, transportId } = data;

        // const subscriber = this.mediaHub.transports.get(transportId);
        // if (subscriber) {
        //   const consumerParameters = await subscriber.consume(producerId);
        //   this.response(requestId, {
        //     ...consumerParameters,
        //     producerId
        //   })
        // }

        break;
      }
      case 'unsubscribe': {
        const { senderId, transportId } = data;


        await this.requestMedia('unsubscribe', {
          transportId,
          senderId
        })
        this.response(requestId);

        break;
      }
      case 'pause': {
        const { senderId, transportId, role } = data;

        await this.requestMedia('pause', {
          transportId,
          senderId
        })
        this.response(requestId);
        if('pub' == role){
          this.pub2Session('pause',{
            senderId
          })
        }
        break;
      }
      case 'resume': {
        const { senderId, transportId, role } = data;

        await this.requestMedia('resume', {
          transportId,
          senderId
        })
        this.response(requestId);
        if('pub' == role){
          this.pub2Session('resume',{
            senderId
          })
        }
        break;
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


  async notifySenders(tokenId) {
    const transportId = idGenerator(this.sessionId, this.tokenId, 'pub');
    const { senders } = await this.requestMedia('senders', {
      transportId
    });
    senders.forEach(sender => {
      this.pub2One(tokenId, 'publish', {
        senderId: sender.senderId,
        metadata: sender.metadata
      });
    });
  }

  async notifySender2Client(tokenId, senderId, metadata) {
    const transportId = idGenerator(this.sessionId, this.tokenId, 'sub');

    const { parameters } = await this.requestMedia('subscribe', {
      transportId,
      senderId
    })

    this.notification({
      'event': 'publish',
      'data': {
        ...parameters,
        senderId,
        tokenId,
        metadata
      }
    });
  }

  /* -------  NATS  --------- */
  async handleOneMsg(msg) {
    let jsonMsg = JSON.parse(msg);
    let { tokenId, method, data } = jsonMsg;
    console.log(`individual message: ${tokenId} -> ${this.tokenId} `, jsonMsg);

    switch (method) {
      case 'join': {
        const { metadata } = data;
        this.notification({
          event: 'join',
          data: {
            tokenId,
            metadata
          }
        });

        //FIXME: maybe useless
        this.notifySenders(tokenId);
        break;
      }
      case 'publish': {
        const { senderId, metadata } = data;
        this.notifySender2Client(tokenId, senderId, metadata);
        break;
      }
    }

  }

  async handleSessionMsg(msg) {
    let jsonMsg = JSON.parse(msg);
    let { tokenId, method, data } = jsonMsg;
    if (tokenId != this.tokenId) {
      console.log(`session message: ${tokenId} -> ${this.tokenId}`, jsonMsg);
      switch (method) {
        case 'join': {
          const { metadata } = data;
          this.notification({
            event: 'join',
            data: {
              tokenId,
              metadata
            }
          });

          this.pub2One(tokenId, 'join', {
            metadata: this.metadata
          });

          this.notifySenders(tokenId);
          break;
        }
        case 'leave': {
          this.notification({
            event: 'leave',
            data: {
              tokenId
            }
          });
          break;
        }
        case 'publish': {
          const { senderId, metadata } = data;

          this.notifySender2Client(tokenId, senderId, metadata);
          break;
        }
        case 'unpublish': {
          const { senderId } = data;
          this.notification({
            'event': 'unpublish',
            'data': {
              senderId,
              tokenId
            }
          });

          break;
        }
        case 'pause': {
          const { senderId } = data;
          this.notification({
            'event': 'pause',
            'data': {
              senderId,
            }
          });
          break;
        }
        case 'resume': {
          const { senderId } = data;
          this.notification({
            'event': 'resume',
            'data': {
              senderId,
            }
          });
          break;
        }
      }
    }
  }

  //subscribe NATS
  subscribeNats() {
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