import * as spiderSocket from './../src/spidersocket.js';
import * as util from './../lib/util.js';

const test = typeof module !== 'undefined' && module.exports ? require('./tape.js') : self.test;

const isLocalhost = typeof location == 'undefined' || location.hostname === "localhost" || location.hostname === "127.0.0.1";
const onlieServer = "wss://spider-8t2d6.ondigitalocean.app/net";
const localServer = "ws://localhost:8080/net";
const testServerUri = ( isLocalhost ? localServer : onlieServer );

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

test('Is a spider running', async function (t) {
	const whatToDo = 'Run from terminal: go run .';
	t.comment(testServerUri);
	try {
		let conn = await spiderSocket.connectToUri(testServerUri);
		util.waitForClose(conn);
	}
	catch (e) {
		t.fail("Got error: " + e);
		throw "No websocket running. "+e
	}
	t.end();
});

test('Test async timeout', async function (t) {
	await util.runWithTimeout(util.sleep(10), 20);
	try {
		await util.runWithTimeout(util.sleep(20), 10);
		t.fail("Sholud never be reached");
	}
	catch{}

	t.end();
});

test('Test spider', async function (t) {
	let hostConn = await spiderSocket.connectToUri(testServerUri);
	let m1;
	try {
		m1 = await util.socketReader(hostConn);
		t.comment(m1);
	} catch (error) {
		t.fail("No m1");
	}
	let clientAddress = testServerUri + '/' + util.ab2hex(m1);
	let clientConn = await spiderSocket.connectToUri(clientAddress);
	try {
		let m2 = await util.socketReader(hostConn);
		t.comment(m2);
	} catch (error) {
		t.fail("No m2");
	}
	util.waitForClose(hostConn);
	util.waitForClose(clientConn);
	t.end();
});