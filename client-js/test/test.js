//import * as spiderSocket from './../src/spidersocket.js';
import * as util from './../lib/util.js';
import * as asyncsocket from './../src/asyncsocket.js';


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
    queue.push("gris")
	queue.push("svin")

	t.equals(await queue.pull(100), "gris", "Got correct string 'gris'");
	t.equals(await queue.pull(100), "svin", "Got correct string 'svin'");
	t.equals(await queue.pull(100), null, "Should time out");

	queue.pull(1000)
	.then(function(data){
		t.equals(data, "galt", "Got correct string 'galt'");
	})
	.catch(function(data){
		t.fail("Should not get error: " + e.message)
	})
	queue.push("galt")

	// Add to expose error in queue
	//queue.push("so")
	//t.equals(await queue.pull(100), "so", "Got correct string 'so'");

	t.end();
});

test('Test spider', async function (t) {
	let hostConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(testServerUri));
	let m1;
	try {
		m1 = await hostConn.receive(1000);
		t.comment("m1: " + util.ab2hex(m1));
	} catch (error) {
		t.fail("No m1");
	}
	let clientAddress = testServerUri + '/' + util.ab2hex(m1);
	let clientConn = asyncsocket.wrapWebsocket(await asyncsocket.setupWebsocket(clientAddress));
	try {
		let m2 = await hostConn.receive(1000);
		t.comment("m2: " + util.ab2hex(m2));
	} catch (error) {
		t.fail("No m2");
	}

	clientConn.send(util.hex2ab("deadbeef"))
	try {
		let m3 = await hostConn.receive(1000);
		t.comment("m3: " + util.ab2hex(m3));
	} catch (error) {
		t.fail("No m3");
	}

	await hostConn.close();
	await clientConn.close();
	t.end();
});