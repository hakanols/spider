import * as util from './../lib/util.js';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

export async function spiderSocket(url) {
    let receiveBuffer = new Uint8Array([]);

    let exposedFunctions = {
        onclose: () => console.log('onclose called'),
        onerror: (e) => console.error('ERROR: ', e),
        onmessage: () => console.log('onmessage called'),
        onopen: () => console.log('onopen called'),
        close: close,
        send: send,
        CONNECTING: CONNECTING,
        OPEN: OPEN,
        CLOSING: CLOSING,
        CLOSED: CLOSED,
        readyState: CLOSED
    };

    async function connectingToDevice(device) {
        exposedFunctions.readyState = CONNECTING;
        console.log('> Name: ' + device.name);
        console.log('> Id: ' + device.id);
        console.log('> Connected: ' + device.gatt.connected);
        return await device.gatt.connect();
    }

    function connectedToServer(device, server) {
        console.log("Connected to " + server.device.id);
        device.addEventListener('gattserverdisconnected', onDisconnected);
    }

    async function getPrimaryService(server) {
        console.log('getServiceAndCharacteristics server=' + server);
        return await server.getPrimaryService(POT_SERVICE_UUID);
    }

    async function getCharacteristics(service) {
        console.log('Getting Characteristics for service ' + service.uuid);

        let getCalls = [
            service.getCharacteristic(TX_CHARACTERISTIC_UUID),
            service.getCharacteristic(RX_CHARACTERISTIC_UUID)
        ];

        [txCharacteristic, rxCharacteristic] = await Promise.all(getCalls);
    }

    async function setupDataListener() {
        let handle = await rxCharacteristic.startNotifications();
        await handle.addEventListener('characteristicvaluechanged', receive);
        console.log('Listening for received data.');
        exposedFunctions.readyState = OPEN;
    }

    function onDisconnected() {
        exposedFunctions.onclose();
        exposedFunctions.readyState = CLOSED;
    }

    function receive(event) {
        let chunk = event.target.value.buffer;

        receiveBuffer = addByteArray(receiveBuffer, chunk);

        while (true) {
            if (receiveBuffer.length < 4){
                break;
            }
            let messageLength = bytesToIntLE(receiveBuffer, 0);
            if (messageLength <= 0) {
                throw "Say what??? Got messageLength: " + messageLength;
            }

            if (receiveBuffer.length < (4 + messageLength)){
                break;
            }

            let message = receiveBuffer.slice(4, 4+messageLength);
            receiveBuffer = receiveBuffer.slice(4+messageLength);

            exposedFunctions.onmessage({data: message});
        }
    }

    function send(data) {
        if (!((data instanceof ArrayBuffer) || (data instanceof Uint8Array))) {
            throw new TypeError('Must only send ArrayBuffer or Uint8Array')
        }

        let header = intToBytesLE(data.byteLength);
        let message = addByteArray(header, data);

        while (message.length !== 0) {
            let chunk = message.slice(0, MTU);
            message = message.slice(MTU);
            sendQueue.add(sendChunk(chunk));
        }
    }

    function sendChunk(chunk) {
        return async (resolve) => {
            await txCharacteristic.writeValue(chunk);
            resolve();
        }
    }

    function addByteArray(arrayA, arrayB){
        if (arrayA instanceof ArrayBuffer) {
            arrayA = new Uint8Array(arrayA)
        }
        if (arrayB instanceof ArrayBuffer) {
            arrayB = new Uint8Array(arrayB)
        }
        if (!(arrayA instanceof ArrayBuffer) || !(arrayB instanceof ArrayBuffer)) {
            arrayB = new Uint8Array(arrayB)
        }

        let returnArray = new Uint8Array(arrayA.length + arrayB.length);
        returnArray.set(arrayA);
        returnArray.set(arrayB, arrayA.length);

        return returnArray;
    }

    function intToBytesLE(num) {
        let arr = new ArrayBuffer(4);
        let view = new DataView(arr);
        view.setUint32(0, num, true);
        return arr;
    }

    function bytesToIntLE(arr, offset) {
        let data = new Uint8Array(arr, offset, offset + 4);
        let view = new DataView(data.buffer);
        return view.getInt32(0, true);
    }

    function close() {
        exposedFunctions.readyState = CLOSING;
        selectedDevice.gatt.disconnect();
    }

    async function constructor(url) {

        let socket = await asyncsocket.setupWebsocket(uri)

        selectedDevice = device;
        connectedServer = await connectingToDevice(selectedDevice);
        connectedToServer(selectedDevice, connectedServer);
        let service = await getPrimaryService(connectedServer);
        await getCharacteristics(service);
        await setupDataListener();

        return exposedFunctions;
    }

    return await constructor(url);
}

export async function connectToUri(uri) {
    let socket = await util.setupWebsocket(uri);
    return socket;
}