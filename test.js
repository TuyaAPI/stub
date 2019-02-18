const TuyAPI = require('tuyapi');
const TuyaStub = require('.');

const stub = new TuyaStub({id: '30315056dc4f2257dc8e',
  key: '1426ee407d5d7e2b',
  state: {1: false, 2: true}});

stub.startServer();

stub.startUDPBroadcast();

const stubDevice = new TuyAPI({id: '30315056dc4f2257dc8e',
  key: '1426ee407d5d7e2b',
  ip: 'localhost'});

/* StubDevice.connect().then(() => {
  stubDevice.set({set: true}).then(result => {
    stubDevice.get().then(status => {
      console.log(status)
    })
  })
}) */

stubDevice.find().then(() => {
  stubDevice.connect().then(() => {
    stubDevice.get().then(status => {
      console.log(status);
    });
  });
});
