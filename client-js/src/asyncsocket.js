import * as util from './../lib/util.js';
let WebSocket = null;

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

async function lazyWebSocketLoader() {
	// This lazy loader exist cause a problem on iOS browsers:
	// Safari, Firefox and Chrome. Apparently await can not be
	// used on initialization  if the module is loaded with
	// dynamic import (Perhaps more generic). Even if the await
	// is hidden behind a if statement that did not help.
	if (WebSocket == null) {
		if (typeof window === 'undefined'){
			console.log("Loading NodeJS Websocket module")
			let NodeWebSocket = await import('websocket')
			WebSocket = NodeWebSocket.default.w3cwebsocket;
		}
		else {
			console.log("Loading native Browser Websocket support")
			WebSocket = self.WebSocket;
		}
	}
}

export async function setupWebsocket(uri){
	await lazyWebSocketLoader()
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
		console.debug(event)
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

