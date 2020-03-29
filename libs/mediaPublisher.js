const MediaTransport = require('./mediaTransport');

class MediaPublisher extends MediaTransport {
  constructor(id, router) {
    super(id, router);
    this.producers = new Map();
  }

  async init() {
    await super.init(true);
  }

  async produce(kind, rtpParameters, appData) {
    const producer = await this.transport.produce({ kind, rtpParameters, appData });
    this.producers.set(producer.id, producer);
    return producer.id;
  }

}

module.exports = MediaPublisher;