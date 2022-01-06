import * as util from './../lib/util.js';
import * as asyncsocket from './asyncsocket.js';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

export async function createSpiderSocket(url, listener){
    const messageTypeNew = 1
	const messageTypeMessage = 0
	const messageTypeClose = 2

    let sessions = {}

    let exposedFunctions = {
        onerror: (e) => console.debug('onerror message: '+e),
        close: close,
        getConnUrl: function(){return connUrl},
        OPEN: OPEN,
        CLOSING: CLOSING,
        CLOSED: CLOSED,
        readyState: CLOSED
    };

    function spiderSend(message){
        hostConn.send(message);
    }

    function createSocket(sessionId){

        function send(payload){
            spiderSend( new Uint8Array( [sessionId, messageTypeMessage, ...payload]) )
        }

        function close(){
            spiderSend( new Uint8Array( [sessionId, messageTypeClose]) )
            exposedFunctions.onclose()
        }

        let exposedFunctions = {
            onopen: () => console.debug('onopen sID: '+sessionId),
            onerror:  (e) => console.debug('onerror sID: '+sessionId+' message: '+e),
            onclose: (event) => console.debug('onclose sID: '+sessionId+' event: '+event),
            onmessage: (message) => console.debug('onmessage sID: '+sessionId+' message: '+message),
            send: send,
            close: close,
            CONNECTING: CONNECTING,
            OPEN: OPEN,
            CLOSING: CLOSING,
            CLOSED: CLOSED,
            readyState: CONNECTING
        };

        exposedFunctions.readyState = OPEN;
        exposedFunctions.onopen();

        return exposedFunctions
    }

    async function handleReceive(){
        exposedFunctions.readyState = OPEN;
        while (exposedFunctions.readyState == OPEN){
            let message = await hostConn.receive(100);
            if (message == null){
                continue;
            }
            let sessionId = message[0];
            if (message.length == 1){
                console.warn('Short message:');
                console.warn(message);
                continue;
            }
            let messageType = message[1];
            switch(messageType) {
                    case messageTypeNew:
                        // ToDo Check for sessionId occupied
                        let session = createSocket(sessionId);
                        sessions[sessionId] = session;
                        listener(session);
                        break;
                    case messageTypeMessage:
                        // ToDo Check for exist
                        let payload = message.slice(2);
                        sessions[sessionId].onmessage({data: payload});
                        break;
                    case messageTypeClose:
                        // ToDo Check for exist
                        sessions[sessionId].readyState = CLOSED;
                        delete sessions[sessionId];
                        break;
                    default:
                        console.warn('Unknown message:');
                        console.warn(message);
            }
        }
        exposedFunctions.readyState = CLOSED;
        console.log('Closed')
    }

    let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(url));
	let socketId = await hostConn.receive(50);
    let connUrl = url + '/' + util.ab2hex(socketId);

    function close() {
		return new Promise(async function (resolve) {
			console.log('Close')
            exposedFunctions.readyState = CLOSING;
            await hostConn.close();
			resolve();
		})
	}

    handleReceive()

    return exposedFunctions;
}