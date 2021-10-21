import * as util from './../lib/util.js';
const WebSocket = getWebSocket();

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

async function getWebSocket(){
	if (typeof window === 'undefined') {
		console.log("Browser")
		//const nodeWebsocket = await import('websocket');
		//return nodeWebsocket.default.w3cwebsocket;
	}
	else {
		console.log("NodeJS")
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

	var readQueue = util.waitQueue();

	function messageEvent(event){
        readQueue.push(new Uint8Array(event.data));
	}

	async function receive(waitTime){
		var message = readQueue.pull(waitTime);
		if (message == null){
			throw Exception("Timeout")
		}
		return message
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

