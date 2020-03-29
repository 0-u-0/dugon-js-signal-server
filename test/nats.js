const nats = require('nats');

const nc = nats.connect();

nc.subscribe('abc.*',function(message){
  console.log(message);
});



