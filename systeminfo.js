/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
// jshint node:true, esversion:6, strict:true, undef:true, unused:true
"use strict";
const utils = require('./lib/utils'),
	adapter = utils.adapter('systeminfo'),
	//	dns = require('dns'),
	assert = require('assert'),
	A = require('./myAdapter');

const list = {
		normal: [],
		fast: [],
		slow: []
	},
	roleNames = ["intvalue", "switch", "boolean", "floatvalue", "value.temperature"],
	roleRoles = ["value", "switch", "value", "value", "value.temperature"],
	roleTypes = ["number", "boolean", "boolean", "number", "number"],
	reIsEvalWrite = /\$\((.+)\)/,
	reIsArgWrite = /\$0/g;

let adapterObjects, pollF, pollfastF, pollslowF,
	poll = 30,
	pollfast = 2,
	pollslow = 60;

A.init(adapter, main); // associate adapter and main with MyAdapter

class Cache {
	constructor(fun) { // neue Einträge werden mit dieser Funktion kreiert
		assert(!fun || A.T(fun) === 'function', 'Cache arg need to be a function returning a promise!');
		this._cache = {};
		this._fun = fun;
	}

	get cache() {
		return this._cache;
	}
	get fun() {
		return this._fun;
	}
	set fun(newfun) {
		assert(!newfun || A.T(newfun) === 'function', 'Cache arg need to be a function returning a promise!');
		return (this._fun = newfun);
	}

	cacheItem(item, fun) {
		let that = this;
		assert(!fun || A.T(fun) === 'function', 'Cache arg need to be a function returning a promise!');
		//        A.D(`looking for ${item} in ${A.O(this._cache)}`);
		if (this._cache[item])
			return Promise.resolve(this._cache[item]);
		if (!fun)
			fun = this._fun;
		assert(A.T(fun) === 'function', `checkItem needs a function to fill cache!`);
		return fun(item).then(res => (that._cache[item] = res), err => A.D(`checkitem error ${err} finding result for ${item}`, null));
	}
	clear() {
		this._cache = {};
	}
	isCached(x) {
		return this._cache[x];
	}
}

/*
A.objChange = function (obj) { //	This is needed for name changes
	if (typeof obj === 'string' && obj.indexOf(learnedName) > 0)
		return A.getObject(obj)
			.then(oobj => {
				const nst = oobj.common,
					ncn = nst.name,
					nid = ncn.replace(/[\ \.\,\;]/g, '_'),
					dev = obj.split('.'),
					fnn = dev.slice(2, -1).concat(nid).join('.');
				if (firstCreate || nid === dev[4] || nid.startsWith(defaultName)) // no need to rename!
					return null;
				if (!A.states[fnn] ? (!oobj.native.code ? A.W(`Cannot rename to ${oobj.common.name} because it does not have a learned code: ${obj}`, true) : false) :
					A.W(`Cannot rename to ${ncn} because the name is already used: ${obj}`, true)) {
					oobj.common.name = dev[4];
					return A.setObject(obj, oobj)
						.catch(e => A.W(`rename back err ${e} on ${A.O(oobj)}!`));
				}
				nst.id = (dev[2] + learnedName + nid);
				nst.native = oobj.native;
				//				nst.val = codeName + oobj.native.code;
				if (nid !== dev[4])
					return A.makeState(nst, false, true)
						.then(() => A.removeState(A.I(`rename ${obj} to ${fnn}!`, obj)).catch(() => true));
			}).then(() => A.wait(20))
			.then(() => A.getObjectList({
				startkey: A.ain,
				endkey: A.ain + '\u9999'
			}))
			.then(res => adapterObjects = (res.rows.length > 0 ? adapterObjects = res.rows.map(x => x.doc) : []))
			.catch(err => A.W(`objChange error: ${obj} ${err}`));
};

function sendCode(device, value) {
	let buffer = new Buffer(value.replace(reCODE, ''), 'hex'); //var buffer = new Buffer(value.substr(5), 'hex'); // substr(5) removes CODE_ from string

	device.sendData(buffer);
	return Promise.resolve(device.name + ' sent ' + value);
	//	return Promise.resolve(A.D('sendData to ' + device.name + ', Code: ' + value));
}
*/
A.stateChange = function (id, state) {
	//	A.D(`stateChange of "${id}": ${A.O(state)}`); 
	if (!state.ack) {
		const nid = id.startsWith(A.ain) ? id.slice(A.ain.length) : id;
		//		A.D(`Somebody (${state.from}) id0 ${id0} changed ${id} of "${id0}" to ${A.O(state)}`);
		return A.getObject(nid)
			.then((obj) =>
				obj && obj.native && obj.native.si ? writeInfo(obj.native.si, state) :
				Promise.reject(A.D(`Invalid stateChange for "${nid}"`)))
			.catch(err => A.W(`Error in StateChange for ${nid}: ${A.O(err)}`));
	}
};

/*
A.messages = (msg) => {
	if (A.T(msg.message) !== 'string')
		return A.W(`Wrong message received: ${A.O(msg)}`);
	const st = {
		val: true,
		ack: false,
		from: msg.from
	};
	var id = msg.message.startsWith(A.ain) ? msg.message.trim() : A.ain + (msg.message.trim());

	switch (msg.command) {
		case 'switch_off':
			st.val = false;
			/* falls through *-/
		case 'switch_on':
		case 'send':
			return A.getObject(id)
				.then(obj => obj.common.role === 'button' || (obj.common.role === 'switch' && msg.command.startsWith('switch')) ?
					A.stateChange(id, st) :
					Promise.reject(A.W(`Wrong id or message ${A.O(msg)} id = ${A.O(obj)}`)),
					err => Promise.reject(err))
				.then(() => A.D(`got message sent: ${msg.message}`));
		case 'send_scene':
			return sendScene(msg.message, st);
		case 'send_code':
			if (msg.message.startsWith(A.ain))
				msg.message = msg.message.slice(A.ain.length);
			let ids = msg.message.split('.'),
				code = ids[1];
			id = ids[0];
			if (!id.startsWith('RM:') || !scanList[id] || !code.startsWith(codeName))
				return Promise.reject(A.D(`Invalid message "${msg.message}" for "send" to ${id}${sendName}`));
			return Promise.resolve(A.D(`Executed on ${id} the message "${msg.message}"`), sendCode(scanList[id], code));
		case 'get':
			return A.getState(id);
		case 'switch':
			let idx = A.split(msg.message, '=');
			if (idx.length !== 2 && !idx.startsWith('SP:'))
				return Promise.reject(A.D(`Invalid message to "switch" ${msg.message}" to ${idx}`));
			st.val = A.parseLogic(idx[1]);
			return A.stateChange(idx[0], st);
		default:
			return Promise.reject(A.D(`Invalid command "${msg.command}" received with message ${A.O(msg)}`));
	}
};

function doPoll() {
	A.seriesOf(A.obToArray(scanList), device => {
		if (!device.fun) return Promise.resolve(device.checkRequest = 0);
		device.fun(++device.checkRequest);
		A.wait(2000).then(() => device.checkRequest > pollerr ? (device.checkRequest % 50 === pollerr + 1 ? A.W(`Device ${device.name} not reachable`, true) : true) : false)
			.then(res => device.checkRequest > 10 ? (currentDevice.discover(device.host), res) : res)
			.then(res => A.makeState({
				id: device.name + reachName,
				write: false,
				role: 'indicator.unreach',
				type: typeof true,
			}, res, true))
			.catch(err => A.W(`Error in polling of ${device.name}: ${A.O(err)}`));
		return Promise.resolve(device.fun);
	}, 50);
}

*/

function doPoll(list) {
	A.D(`I should poll ${A.O(list)} now!`);
	const caches = {};
	return A.seriesOf(list, item => {
			if (!item.fun) return Promise.reject(`Undefined function in ${A.O(item)}`);
			var ca = item.type + item.source;
			if (!caches[ca])
				caches[ca] = new Cache();
			return caches[ca].cacheItem(ca, item.fun)
				.then(res => 
					item.regexp ? res.match(item.regexp) : [res] )
				.then(A.D, A.W);
		}, 1)
		.catch(e => A.W(`Error ${e} in doPoll for ${A.O(list)}`));
}

function main() {
	function tint(str, def) {
		if (str && !isNaN(parseInt(str)))
			return parseInt(str);
		return def || 0;
	}

	function createFunction(ni) {
		switch (ni.type) {
			case 'sys':
				ni.fun = () => {
					return A.readFile(ni.source);
				};
				break;
			case 'exec':
				ni.fun = () => A.exec(ni.source);
				break;
			case 'file':
				ni.fun = () => {
					return A.readFile(ni.source);
				};
				break;
			case 'web':
				ni.fun = () => {
					return A.get(ni.source);
				};
				break;

			default:
				A.W(`Not implemented type ${ni.type}`);
		}
	}

	A.I(`Startup Systeminfo Adapter ${A.ains}: ${A.O(adapter.config)}`);

	if ((A.debug = adapter.config.startup.startsWith('debug!')))
		adapter.config.startup = adapter.config.startup.slice(A.D(`Debug mode on!`, 6));

	poll = tint(adapter.config.poll, 10);
	pollfast = tint(adapter.config.pollfast, 2);
	pollslow = tint(adapter.config.poll, 300);

	A.D(`Systeminfo will poll every ${poll}sec, pollfast every ${pollfast}sec and pollslow every ${pollslow}min.`);

	for (let item of adapter.config.items) {
		let ni = A.clone(item);
		let ir = item.name.trim().match(/^(\S*)\s*(\(\s*(\S+)\s*(\,\s*\S+\s*)*\))?\s*(\S*)$/);
		if (!ir)
			return Promise.resolve(A.W(`Invalid item name in ${A.O(item)}`));
		if (ir[2]) {
			ni.id = A.trim(ir[2].slice(1,-1).split(',')).map(s => ir[1] + s + ir.slice(-1)[0]);
		} else ni.id = ir[1]+ir.slice(-1)[0];
		ni.write = ni.write && ni.write.trim();
		ni.source = ni.source.trim();
		ni.conv = ni.conv && ni.conv.trim();
		ni.id = ni.name.trim();
		let ra = A.trim(A.T(ni.role, "") ? ni.role.split('/') : 'value'),
			unit = ra.length > 1 ? ra[1] : undefined,
			rr = ra[0],
			ri = roleNames.indexOf(rr),
			role = ri >= 0 ? roleRoles[ri] : 'value',
			type = ri >= 0 ? roleTypes[ri] : 'string',
			opt = {
				id: ni.id,
				state: 'state',
				write: item.write.trim().length > 0,
				type: type,
				role: role,
				unit: unit,
				native: {}
			};

		try {
			ni.regexp = ni.regexp && ni.regexp.trim().length>0 ? new RegExp(ni.regexp.trim()) : null;
		} catch (e) {
			A.W(`Error ${e} in RegExp of ${A.O(ni)}`);
			ni.regexp = null;
		}
		opt.native.si = A.clone(ni);
		createFunction(ni);
		ni.opt = opt;
		list[ni.poll].push(ni);

	}

	A.D(`Systeminfo will use fast ${A.O(list.fast)}.`);
	A.D(`Systeminfo will use normal ${A.O(list.normal)}.`);
	A.D(`Systeminfo will use slow ${A.O(list.slow)}.`);

	A.getObjectList({
			startkey: A.ain,
			endkey: A.ain + '\u9999'
		})
		.then(res =>
			adapterObjects = res.rows.length > 0 ?
			A.D(`Adapter has  ${res.rows.length} old states!`, adapterObjects = res.rows.map(x => x.doc)) : [])
		//		.then(() => didFind = Object.keys(scanList))
		.then(() => A.seriesOf(adapterObjects.filter(x => x && x.native && x.native.host), dev => {
			let id = dev.native.host.name; // dev._id.slice(A.ain.length);
			return Promise.resolve(id);
		}, 1))
		.then(() => {
			if (list.normal.length > 0)
				pollF = setInterval(doPoll, poll * 1000, list.normal);
			if (list.fast.length > 0)
				pollfastF = setInterval(doPoll, pollfast * 1000, list.fast);
			if (list.slow.length > 0)
				pollslowF = setInterval(doPoll, pollslow * 1000 * 60, list.slow);

		})
		.then(() => A.I(`Adapter ${A.ains} started and found ${list.length} items to process.`))
		.catch(e => A.W(`Unhandled error in main: ${e}`));
}