import * as spiderSocket from './../src/spidersocket.js';
import * as util from './../lib/util.js';

const test = typeof module !== 'undefined' && module.exports ? require('./tape.js') : self.test;

const testServerUri = "ws://localhost:8080/net";

function createEventCounter() {
	let events = [];
	return {
		handleEvent: function(id, value){
			events.push({
				id: id,
				value: value
			})
		},
		getEvents: function(){
			let latestEvents = [...events];
			events = [];
			return latestEvents;
		}
	}
}

test('Is a browsable running', async function (t) {
	const whatToDo = 'Run from terminal: go run .';
	try {
		let conn = await spiderSocket.connectToUri(testServerUri);
		util.waitForClose(conn);
	}
	catch (e) {
		console.error("Got error: " + e);
		throw "No websocket running. "+e
	}

	t.end();
});

test('Connect to localhost', async function (t) {
	let hostConn = await spiderSocket.connectToUri(testServerUri);
	let m1 = await util.socketReader(hostConn);
	let clientAddress = testServerUri + '/' + util.ab2hex(m1);
	console.log(clientAddress);
	let clientConn = await spiderSocket.connectToUri(clientAddress);
	let m2 = await util.socketReader(hostConn);
	console.log(m2);
	util.waitForClose(hostConn);
	util.waitForClose(clientConn);
	t.end();
});
