class MediaPublishTransport {
  constructor(router) {
    this.router = router;
    this.transport = null;
    this.producers = new Map();
  }

  get transportParameters() {
    //TODO: 
    const dtls = {
      fingerprint: this.transport.dtlsParameters.fingerprints[2],
      role: 'client'
    };

    return {
      id: this.transport.id,
      iceParameters: this.transport.iceParameters,
      iceCandidates: this.transport.iceCandidates,
      dtlsParameters: dtls,
    }
  }

  async init() {
    // TODO: move to config
    const webRtcTransportOptions =
    {
      listenIps:
        [
          {
            ip: '127.0.0.1',
            announcedIp: '127.0.0.1'
          }
        ],
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      // Additional options that are not part of WebRtcTransportOptions.
      maxIncomingBitrate: 1500000,
      enableSctp: false,
      numSctpStreams: 0,
      appData: { consuming: false, producing: true }
    };

    this.transport = await this.router.createWebRtcTransport(webRtcTransportOptions);
  }

  async setDtlsParameters(dtlsParameters) {
    await this.transport.connect({ dtlsParameters });
  }

  async produce(kind, rtpParameters) {
    const producer = await this.transport.produce({ kind, rtpParameters });
    this.producers.set(producer.id, producer);
    return producer.id;
  }


}

module.exports = MediaPublishTransport;