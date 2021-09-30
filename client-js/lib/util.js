const WebSocket = typeof module !== 'undefined' && module.exports ? require('websocket').w3cwebsocket : self.WebSocket;

export function hex2Uint8Array(str) {
    str = str.trim().toLowerCase();
    if (str.substring(0,2) === '0x') {
        str = str.substring(2, str.length)
    }
    if (str.length % 2 !== 0) {
        throw new Error("String length has to be even. \n\t" +
            "Length: " + str.length)
    }
    let byte;
	let arr = [];
    for (let i = 0; i < str.length; i += 2) {
        byte = str.substring(i, i+2);
        if (!((/[0-9a-fA-F]{2}/).test(byte))) {
            throw new Error("Bad string format, must be hexadecimal.\n\t" +
                "String: " + str + "\n\t" +
                "Byte: " + byte + "\n\t" +
                "Pos: " + i)
        }
        arr.push(parseInt(byte, 16))
    }
    return new Uint8Array(arr)
}

// Takes a hex-string and returns an ArrayBuffer
export function hex2ab(hex){
	if (typeof hex !== 'string') {
		throw new Error('Input must be string, was ' + typeof hex)
	}
	hex = hex.trim();
	if (hex.length % 2 !== 0) {
		throw new Error('String length must be even')
	}
	if (hex.substring(0,2) === '0x') {
		hex = hex.substring(2, hex.length)
	}

	let arr = [];
	for (let i = 0; i < hex.length; i += 2) {
		arr.push(parseInt(hex.substring(i, i+2), 16))
	}
	return new Uint8Array(arr).buffer
}

// Takes an ArrayBuffer and returns a hex-string
export function ab2hex(buffer){
    return Array.prototype.map.call(new Uint8Array(buffer),
    		x => ('00' + x.toString(16)).slice(-2)).join('');
}

// Compares two Uint8Arrays for byte equality
export function uint8ArrayEquals(uints1, uints2){
	if (!(uints1 instanceof Uint8Array) ||
		!(uints2 instanceof Uint8Array)) {
		throw new Error("Expected Uint8Arrays")
	}
	if (uints1.length !== uints2.length) {
		return false
	}
	for (let i = 0; i < uints1.length; i++) {
		if (uints1[i] !== uints2[i]) {
			return false
		}
	}
	return true
}

// Compares two ArrayBuffers for byte equality
export function bufferEquals(buffer1, buffer2) {
	if (!(buffer1 instanceof ArrayBuffer) ||
		!(buffer2 instanceof ArrayBuffer)) {
		throw new Error("Expected ArrayBuffers")
	}
	let bytes1 = new Uint8Array(buffer1);
	let bytes2 = new Uint8Array(buffer2);
	if (bytes1.length !== bytes2.length) {
		return false
	}
	for (let i = 0; i < bytes1.length; i++) {
		if (bytes1[i] !== bytes2[i]) {
			return false
		}
	}
	return true
}

// Returns the number of ms since Unix epoch
// Like Java's System.currentTimeMillis
export function currentTimeMs() {
	if (!Date.now) {
		return new Date.getTime()
	} else {
		return Date.now()
	}
}

// Returns true iff arg is a string
export function isString(arg) {
	return typeof arg === "string" || arg instanceof String
}

// Returns true iff arg is an array
export function isArray(arg) {
	if (!Array.isArray) {
	    return Object.prototype.toString.call(arg) === '[object Array]'
  	} else {
  		return Array.isArray(arg)
  	}
}

export async function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export function runWithTimeout(prom, time) {
	// https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
	let timer;
	return Promise.race([
		prom,
		new Promise((_r, reject) => timer = setTimeout(reject, time))
	]).finally(() => clearTimeout(timer));
}

export function triggWaiter(){
    let trigger = null;
	function waiter(waitTime){
		return Promise.race([
			new Promise(function(resolve){
				trigger = resolve;
			}),
			sleep(waitTime)
		])
		.finally(() => trigger = null);
	}

	function trigg(){
        if (trigger != null){
			trigger()
		}
	}
	return {
		waiter: waiter,
		trigg: trigg
	}
}

export function waitQueue(){
	let queue = [];
	let trigger = triggWaiter();

	async function pull(waitTime){
		let data = queue.shift();
		if (data != undefined){
			return data;
		}
		await trigger.waiter(waitTime)
		data = queue.shift()
		if (data != undefined){
            return data;
		}
		return null
	}

	function push(data) {
		queue.push(data)
		trigger.trigg()
	}

    return {
        pull: pull,
        push: push
    }
}