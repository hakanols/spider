import * as util from './../lib/util.js';
let WebSocket = await webSocketLoader();

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

async function webSocketLoader() {
	if (typeof window === 'undefined'){
		console.log("Loading NodeJS Websocket module")
		let NodeWebSocket = await import('websocket')
		return NodeWebSocket.default.w3cwebsocket;
	}
	else {
		console.log("Loading native Browser Websocket support")
		return self.WebSocket;
	}
}

export async function setupWebsocket(uri){
	let webSocket = new WebSocket(uri);
	webSocket.binaryType = "arraybuffer";
	return await new Promise(function (resolve, reject) {
		webSocket.onclose = function(){
			reject("Closed during connection");
		};

		webSocket.onerror = function(){
			reject("Error during connection: " + uri);
		};

		webSocket.onopen = function() {
			resolve(webSocket)
		};
	});
}

export function wrapWebsocket(webSocket){

    webSocket.onclose = () => console.log('onclose called');
    webSocket.onerror = (e) => console.error('ERROR: ', e);
    webSocket.onmessage = messageEvent

	let readQueue = util.waitQueue();

	function messageEvent(event){
        readQueue.push(new Uint8Array(event.data));
	}

	async function receive(waitTime){
		return readQueue.pull(waitTime);
	}

	function send(message){
		webSocket.send(message);
	}

	function close() {
		return new Promise(function (resolve) {
			webSocket.onclose = function(){
				resolve();
			}
			webSocket.close();
		})
	}

    return {
        close: close,
        receive: receive,
        send: send,
        CONNECTING: CONNECTING,
        OPEN: OPEN,
        CLOSING: CLOSING,
        CLOSED: CLOSED,
        readyState: CLOSED
    }
}

