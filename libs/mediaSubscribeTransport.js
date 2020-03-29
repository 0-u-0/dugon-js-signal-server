class MediaSubscribeTransport{
  constructor(){
    this.consumingTransport = null;
    this.consumers = new Map();
  }
}

module.exports = MediaSubscribeTransport;