const mediasoup = require('mediasoup');

const MediaPublishTransport = require('./mediaPublishTransport');
const MediaSubscribeTransport = require('./mediaSubscribeTransport');

const mediaCodecs = [{
  kind: 'audio',
  mimeType: 'audio/opus',
  clockRate: 48000,
  channels: 2
},
{
  kind: 'video',
  mimeType: 'video/VP8',
  clockRate: 90000,
  parameters:
  {
    'x-google-start-bitrate': 1000
  }
}];

class MediaHub {
  constructor() {
    this.worker = null;
    this.router = null;

    this.publishTransports = new Map();
    this.subscribeTransports = new Map();
  }

  async init() {
    this.worker = await mediasoup.createWorker(
      {
        logLevel: 'warn',
        logTags: [
          'info',
          'ice',
          'dtls',
          'rtp',
          'srtp',
          'rtcp',
          'rtx',
          'bwe',
          'score',
          'simulcast',
          'svc',
          'sctp'
        ],
        rtcMinPort: 40000,
        rtcMaxPort: 49999
      });

    this.worker.on('died', () => {
      console.log('mediasoup Worker died, exiting  in 2 seconds... [pid:%d]', this.worker.pid);

      setTimeout(() => process.exit(1), 2000);
    });

    this.router = await this.worker.createRouter({ mediaCodecs });

  }

  async createPublishTransport(id) {
    const publishTransport = new MediaPublishTransport(this.router);
    await publishTransport.init();
    this.publishTransports.set(id,publishTransport);
    return publishTransport;
  }

  

}


module.exports = MediaHub;