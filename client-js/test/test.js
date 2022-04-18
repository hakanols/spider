import * as util from './../lib/util.js';
import * as asyncsocket from './../src/asyncsocket.js';
import * as spidersocket from './../src/spidersocket.js';
import test from './tap-esm.js'

const isLocalhost = typeof location == 'undefined' || location.hostname === "localhost" || location.hostname === "127.0.0.1";
const onlieServer = "wss://spider-8t2d6.ondigitalocean.app/net";
const localServer = "ws://localhost:8080/net";
const testServerUri = ( isLocalhost ? localServer : onlieServer );

console.log('Version: 0.0.10')

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

	t.equal(await queue.pull(50), "gris", "Got correct string 'gris'");
	t.equal(await queue.pull(50), "svin", "Got correct string 'svin'");
	t.equal(await queue.pull(50), null, "Should time out");

	let trigger = util.triggWaiter();
	queue.pull(50)
	.then(function(data){
		t.equal(data, "galt", "Got correct string 'galt'");
		trigger.trigg();
	})
	.catch(function(err){
		t.fail("Should not get error: " + err.message);
	})
	queue.push("galt")

	await trigger.waiter(50); // Remove to expose error in queue
	queue.push("sugga");
	t.equal(await queue.pull(50), "sugga", "Got correct string 'sugga'");

	t.end();
});

test('Test websocket sanity', async function (t) {
	let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(testServerUri));
	let socketId = await hostConn.receive(200);
	console.log("Socket ID: " + socketId);

	let nothing = await hostConn.receive(200);
	console.log("Got nothing?: " + nothing);

	await hostConn.close();
	t.end();
});

test('Test spider', async function (t) {
	const messageTypeNew = 1
	const messageTypeMessage = 0
	const messageTypeClose = 2

	let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(testServerUri));
	let socketId = await hostConn.receive(200);
	let clientAddress = testServerUri + '/' + util.ab2hex(socketId);
	console.log("Host Address: " + clientAddress);
	let clientConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(clientAddress));

	let m1 = await hostConn.receive(200);
	t.ok(m1 != null, "m1 is not null");
	let sessionId = m1[0];
	console.log("Session id: " + util.ab2hex([sessionId]));
	t.equal(m1[1], messageTypeNew, "Got new session");

	console.log("Got session id. Start 1s wait")
	let testMessage1 = util.hex2ab("deadbeef")
	clientConn.send(testMessage1)
	let m2 = await hostConn.receive(200);
	t.ok(m2 != null, "m2 is not null");
	t.equal(m2[0], sessionId, "Matching session id");
	t.equal(m2[1], messageTypeMessage, "Got new message");
	t.arrayEqual(m2.slice(2), testMessage1, "M2 matching message");

	let testMessage2 = util.hex2ab("feedcafe")
	let message = new Uint8Array( [sessionId, messageTypeMessage, ...testMessage2]);
	hostConn.send(message)
	let m3 = await clientConn.receive(200);
	t.ok(m3 != null, "m3 is not null");
	t.arrayEqual(m3, testMessage2, "M3 matching message");

	await clientConn.close();
	let m4 = await hostConn.receive(200);
	t.ok(m4 != null, "m4 is not null");
	t.arrayEqual(m4[0], sessionId, "Matching session id");
	t.arrayEqual(m4[1], messageTypeClose, "Got session close");
	t.equal(clientConn.readyState, clientConn.CLOSED, "clientConn is close")

	await hostConn.close();
	t.end();
});

test('Test spider close', async function (t) {
	const messageTypeNew = 1
	const messageTypeClose = 2

	let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(testServerUri));
	let socketId = await hostConn.receive(200);
	let clientAddress = testServerUri + '/' + util.ab2hex(socketId);
	console.log("Host Address: " + clientAddress);

	let clientConn1 = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(clientAddress));
	let m11 = await hostConn.receive(200);
	t.ok(m11 != null, "m11 is not null");
	let sessionId1 = m11[0];
	console.log("Session id: " + util.ab2hex([sessionId1]));
	t.equal(m11[1], messageTypeNew, "Got new session");

	let clientConn2 = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(clientAddress));
	let m21 = await hostConn.receive(200);
	t.ok(m21 != null, "m11 is not null");
	let sessionId2 = m21[0];
	console.log("Session id: " + util.ab2hex([sessionId2]));
	t.equal(m21[1], messageTypeNew, "Got new session");

	let clientConn3 = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(clientAddress));
	let m31 = await hostConn.receive(200);
	t.ok(m31 != null, "m11 is not null");
	let sessionId3 = m31[0];
	console.log("Session id: " + util.ab2hex([sessionId3]));
	t.equal(m31[1], messageTypeNew, "Got new session");

	/////////// Setup Done ///////////////////////

	let closeQueue = util.waitQueue();

	clientConn1.onclose = () => closeQueue.push("clientConn1")
	console.log("Send close from host on id: " + util.ab2hex([sessionId1]));
	hostConn.send(new Uint8Array( [sessionId1, messageTypeClose] ));
	let m12 = await hostConn.receive(200);
	t.ok(m12 != null, "m12 is not null");
	t.arrayEqual(m12[0], sessionId1, "Matching session id");
	t.arrayEqual(m12[1], messageTypeClose, "Got session close");
	let closeString = await closeQueue.pull(4000);
	t.equal(closeString, "clientConn1", "Close wait for: clientConn1");
	t.equal(clientConn1.readyState, clientConn1.CLOSED, "clientConn1 is close");

	clientConn2.onclose = () => closeQueue.push("clientConn2")
	console.log("Client closed with id: " + util.ab2hex([sessionId2]));
	await clientConn2.close();
	let m22 = await hostConn.receive(200);
	t.ok(m22 != null, "m12 is not null");
	t.arrayEqual(m22[0], sessionId2, "Matching session id");
	t.arrayEqual(m22[1], messageTypeClose, "Got session close");
	closeString = await closeQueue.pull(4000);
	t.equal(closeString, "clientConn2", "Close wait for: clientConn2");
	t.equal(clientConn2.readyState, clientConn2.CLOSED, "clientConn2 is close");
	
	clientConn3.onclose = () => closeQueue.push("clientConn3")
	console.log("Close host socket");
	await hostConn.close();
	closeString = await closeQueue.pull(4000);
	t.equal(closeString, "clientConn3", "Close wait for: clientConn3");
	t.equal(clientConn3.readyState, clientConn3.CLOSED, "clientConn3 is close");
	t.equal(hostConn.readyState, hostConn.CLOSED, "hostConn is close");

	t.end();
});

test('Test spider socket', async function (t) {
	let newSocketQueue = util.waitQueue();

	let ss = await spidersocket.createSpiderSocket(testServerUri,
		(newSocket) => newSocketQueue.push(newSocket) );
	t.equal(ss.readyState, ss.OPEN, "Spider Socket is open");
	let connUrl = ss.getConnUrl()

	let clientConn1 = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(connUrl));
	let socket = await newSocketQueue.pull(1000);
	t.ok(socket != null, 'Got a socket');
	let hostSocket1 = asyncsocket.wrapWebsocket(socket)
	t.equal(clientConn1.readyState, clientConn1.OPEN, "clientConn1 is open");
	t.equal(hostSocket1.readyState, clientConn1.OPEN, "hostSocket1 is open");

	let testMessage1 = util.hex2ab("deadbeef")
	hostSocket1.send(testMessage1);
	let m1 = await clientConn1.receive(200);
	t.arrayEqual(m1, testMessage1, "M1 matching message");

	let testMessage2 = util.hex2ab("feedcafe");
	clientConn1.send(testMessage2);
	let m2 = await hostSocket1.receive(200);
	t.arrayEqual(m2, testMessage2, "M2 matching message");

	let clientConn2 = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(connUrl));
	socket = await newSocketQueue.pull(1000);
	t.ok(socket != null, 'Got a socket');
	let hostSocket2 = asyncsocket.wrapWebsocket(socket)

	let testMessage3 = util.hex2ab("01234567")
	hostSocket2.send(testMessage3);
	let m3 = await clientConn2.receive(200);
	t.arrayEqual(m3, testMessage3, "M3 matching message");

	let testMessage4 = util.hex2ab("89abcdef");
	clientConn2.send(testMessage4);
	let m4 = await hostSocket2.receive(200);
	t.arrayEqual(m4, testMessage4, "M4 matching message");

	await clientConn1.close();
	t.equal(clientConn1.readyState, clientConn1.CLOSED, "clientConn1 is closed");
	await util.sleep(200);
	t.equal(hostSocket1.readyState, hostSocket1.CLOSED, "hostSocket1 is closed");
	await hostSocket2.close();
	t.equal(hostSocket2.readyState, hostSocket2.CLOSED, "hostSocket2 is closed")
	await util.sleep(200);
	t.equal(clientConn2.readyState, clientConn2.CLOSED, "clientConn2 is closed");;
	
	let clientConn3 = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(connUrl));
	socket = await newSocketQueue.pull(1000);
	t.ok(socket != null, 'Got a socket');
	let hostSocket3 = asyncsocket.wrapWebsocket(socket)
	t.equal(clientConn3.readyState, clientConn3.OPEN, "clientConn3 is open");
	t.equal(hostSocket3.readyState, clientConn3.OPEN, "hostSocket3 is open");
	await ss.close();
	t.equal(ss.readyState, ss.CLOSED, "Spider Socket is closed");
	t.equal(hostSocket3.readyState, clientConn3.CLOSED, "hostSocket3 is close");
	await util.sleep(200);
	t.equal(clientConn3.readyState, clientConn3.CLOSED, "clientConn3 is close");
	t.end();
});