const MediaTransport = require('./mediaTransport');

class MediaSubscriber extends MediaTransport {
  constructor(id, router) {
    super(id, router);
    this.consumers = new Map();
  }

  async init() {
    super.init(false);
  }

}

module.exports = MediaSubscriber;