import * as util from './../lib/util.js';
import * as asyncsocket from './asyncsocket.js';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

export async function createSpiderSocket(url, listener){
    let sessions = {}
    const messageTypeNew = 1
    const messageTypeMessage = 0
    const messageTypeClose = 2
    let closeSessionQueue = [];
    let closedSpiderTrigger = util.triggWaiter()

    let exposedSpiderFunctions = {
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

        async function close(){
            exposedInnerFunctions.readyState = CLOSING;
            spiderSend( new Uint8Array( [sessionId, messageTypeClose]) );
            let doneTrigger = util.triggWaiter();
            closeSessionQueue.push({sessionId, doneTrigger});
            await doneTrigger.waiter(1000);
            exposedInnerFunctions.readyState = CLOSED;
            exposedInnerFunctions.onclose();
        }

        let exposedInnerFunctions = {
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

        exposedInnerFunctions.readyState = OPEN;
        exposedInnerFunctions.onopen();

        return exposedInnerFunctions
    }

    async function handleReceive(){
        exposedSpiderFunctions.readyState = OPEN;
        while (hostConn.readyState == hostConn.OPEN){
            let message = await hostConn.receive(100);

            while (closeSessionQueue.length != 0) {
                let {sessionId, doneTrigger} = closeSessionQueue.shift();
                if (sessions[sessionId] != null) {
                    delete sessions[sessionId];
                }
                doneTrigger.trigg();
            }

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
                    if (sessions[sessionId] != null) {
                        console.warn('New session id occupied: '+sessionId);
                    }
                    else {
                        let session = createSocket(sessionId);
                        sessions[sessionId] = session;
                        listener(session);
                    }
                    break;
                case messageTypeMessage:
                    if (sessions[sessionId] == null) {
                        console.warn('On message missing session, Id: '+sessionId);
                    }
                    else {
                        let payload = message.slice(2);
                        sessions[sessionId].onmessage({data: payload});
                    }
                    break;
                case messageTypeClose:
                    if (sessions[sessionId] != null) {
                        sessions[sessionId].readyState = CLOSED;
                        sessions[sessionId].onclose();
                        delete sessions[sessionId];
                    }
                    break;
                default:
                    console.warn('Unknown message:');
                    console.warn(message);
            }
        }
        exposedSpiderFunctions.readyState = CLOSED;
        closedSpiderTrigger.trigg();
    }

    let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(url));
    let socketId = await hostConn.receive(200);
    let connUrl = url + '/' + util.ab2hex(socketId);

    async function close() {
        exposedSpiderFunctions.readyState = CLOSING;
        for (const sessionId in sessions) {
            let session = sessions[sessionId]
            session.close()
        }
        await hostConn.close();
        await closedSpiderTrigger.waiter(1000)
    }

    handleReceive(hostConn)

    return exposedSpiderFunctions;
}