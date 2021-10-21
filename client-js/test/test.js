//import * as spiderSocket from './../src/spidersocket.js';
//import * as util from './../lib/util.js';

import * as asyncsocket from './../src/asyncsocket.js';
import test from './tap-esm.js'
let util = await import('./../lib/util.js')

const isLocalhost = typeof location == 'undefined' || location.hostname === "localhost" || location.hostname === "127.0.0.1";
const onlieServer = "wss://spider-8t2d6.ondigitalocean.app/net";
const localServer = "ws://localhost:8080/net";
const testServerUri = ( isLocalhost ? localServer : onlieServer );

test('Is a spider running', async function (t) {
	const whatToDo = 'Run from terminal: go run .';
	console.log(testServerUri);
	try {
		let conn = await asyncsocket.setupWebsocket(testServerUri);
		await conn.close();
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
	catch(e) {
		t.pass("Should throw an timeout")
	}

	t.end();
});


test('Test async triggWaiter', async function (t) {
    let trigger = util.triggWaiter()

	let startTime = performance.now()
	trigger.waiter(500)
	.then(function(){
		t.pass("Should happen")
	})
	trigger.trigg()
	t.ok(performance.now() - startTime < 50, "Should go fast")

	startTime = performance.now()
    await trigger.waiter(500)
    t.ok(450 < performance.now() - startTime, "Should go slow")

	t.end();
});

test('Test queue', async function (t) {
	let queue = util.waitQueue();
    queue.push("gris");
	queue.push("svin");

	t.equal(await queue.pull(100), "gris", "Got correct string 'gris'");
	t.equal(await queue.pull(100), "svin", "Got correct string 'svin'");
	t.equal(await queue.pull(100), null, "Should time out");

	let trigger = util.triggWaiter();
	queue.pull(100)
	.then(function(data){
		t.equal(data, "galt", "Got correct string 'galt'");
		trigger.trigg();
	})
	.catch(function(err){
		t.fail("Should not get error: " + err.message);
	})
	queue.push("galt")

    await trigger.waiter(100); // Remove to expose error in queue
	queue.push("sugga");
	t.equal(await queue.pull(100), "sugga", "Got correct string 'sugga'");

	t.end();
});

test('Test spider', async function (t) {
    const messageTypeNew = 1
	const messageTypeMessage = 0
	const messageTypeClose = 2

	let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(testServerUri));
	let socketId = await hostConn.receive(100);
	let clientAddress = testServerUri + '/' + util.ab2hex(socketId);
	console.log("Host Address: " + clientAddress);
	let clientConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(clientAddress));
	let m1 = await hostConn.receive(100);
	let sessionId = m1[0];
	console.log("Session id: " + util.ab2hex([sessionId]));
    t.equal(m1[1], messageTypeNew, "Got new session");

	let testMessage1 = util.hex2ab("deadbeef")
	clientConn.send(testMessage1)
	let m2 = await hostConn.receive(100);
	t.equal(m2[0], sessionId, "Matching session id");
	t.equal(m2[1], messageTypeMessage, "Got new message");
	t.arrayEqual(m2.slice(2), testMessage1, "M2 matching message");

	let testMessage2 = util.hex2ab("feedcafe")
	var message = new Uint8Array( [sessionId, messageTypeMessage, ...testMessage2]);
    hostConn.send(message)
	let m3 = await clientConn.receive(100);
	t.arrayEqual(m3, testMessage2, "M3 matching message");

	await clientConn.close();
	let m4 = await hostConn.receive(100);
	t.arrayEqual(m4[0], sessionId, "Matching session id");
	t.arrayEqual(m4[1], messageTypeClose, "Got session close");

	await hostConn.close();
	t.end();
});