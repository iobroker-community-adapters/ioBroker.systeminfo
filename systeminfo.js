/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
/*jshint -W089, -W030, -W061, -W083 */
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
	states = {},
	roleNames = ["intvalue", "switch", "boolean", "floatvalue", "value.temperature"],
	roleRoles = ["value", "switch", "value", "value", "value.temperature"],
	roleTypes = ["number", "boolean", "boolean", "number", "number"],
	reIsEvalWrite = /\$\((.+)\)/,
	reIsMultiName = /^(\S*)\s*(\(\s*(\S+)\s*(\,\s*\S+\s*)*\))?\s*(\S*)$/,
	reIsRegExp = /^\/(.*)\/([gimy])*$/,
	reIsArgWrite = /\$0/g;

let pollF, pollfastF, pollslowF,
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

A.stateChange = function (id, state) {
	//	A.D(`stateChange of "${id}": ${A.O(state)}`); 
	if (!state.ack) {
		const nid = id.startsWith(A.ain) ? id.slice(A.ain.length) : id;
		//		A.D(`Somebody (${state.from}) id0 ${id0} changed ${id} of "${id0}" to ${A.O(state)}`);
		return A.getObject(nid)
			.then((obj) =>
				obj && obj.native && obj.native.si && obj.native.si.write ? writeInfo(nid, state) :
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


*/

function writeInfo(id, state) {
	if (!states[id] || !states[id].wfun)
		return Promise.reject(`Err: no write function defined for ${id}!`);
	let obj = states[id];
	let val = state.val;
	A.D(`new state:${A.O(state)} for ${A.O(obj)}`);
	switch (obj.wtext) {
		case 'eval':
			let e = obj.write.replace(reIsArgWrite, val);
			val = eval(e);
			break;
		default:
			break;
	}
	return obj.wfun && obj.wfun(val).then(() => A.makeState(id, state.val, true), A.D);
}

function doPoll(plist) {

	function setItem(item, name, value) {
		A.D(`setItem ${name} to ${value} with ${item.type};${item.conv};${item.role}`);
		if (!states[name])
			states[name] = item;
		if (item.conv)
			switch (item.conv.trim().toLowerCase()) {
				case 'int':
					value = parseInt(value);
					break;
				case 'float':
					value = parseInt(value);
					break;
				case 'bool':
					value = A.parseLogic(value);
					break;
				case 'json':
					value = A.J(value);
					break;
				default:
					try {
						value = eval(item.conv.replace(reIsArgWrite, value));
					} catch (e) {
						A.W(`convert '${item.conv}' for item ${name} failed with: ${e}`);
					}
					break;
			}
		let o = A.clone(item.opt);
		o.id = name;
		return A.makeState(o, value, true);
	}

	if (!plist)
		plist = list.fast.concat(list.normal, list.slow);
	if (plist.length === 0)
		return;
	A.D(`I should poll ${plist.map(x => x.id)} now!`);
	const caches = {};
	return A.seriesOf(plist, item => {
			if (!item.fun) return Promise.reject(`Undefined function in ${A.O(item)}`);
			var ca = item.type + item.source;
			if (!caches[ca])
				caches[ca] = new Cache();
			return caches[ca].cacheItem(ca, item.fun)
				.then(res => {
					let ma = item.regexp && res.match(item.regexp);
					if (ma) {
						if (A.T(item.id, []) && ma.length > 2) {
							return A.seriesIn(item.id, i => {
								i = parseInt(i);
								A.D(`item series part ${item.name}, ${item.id[i]}, ${ma[i + 1]}`);
								return setItem(item, item.id[i], ma[i + 1]);
							}, 10);
						} else {
							res = ma[1];
						}
					}
					if (A.T(item.id, ""))
						return setItem(item, item.id, res);
				})
				.then(A.nop, A.D);
		}, 1)
		.catch(e => A.W(`Error ${e} in doPoll for ${plist}`));
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
				ni.fun = () => A.readFile(ni.source, 'utf8').then(x => x.trim());
				//				ni.wfun = (val) => A.writeFile(ni.source, val.toString(), 'utf8');
				ni.wfun = (val) => {
//					let es = `echo ${val} >${ni.source}`;
					let es = `echo "${val}" | sudo tee ${ni.source}`;
					return A.exec(es).then(x => A.D(`OK: ${x}`),e => A.W(`err: ${e}`));
				};
				ni.wtext = 'eval';
				break;
			case 'exec':
				ni.fun = () => A.exec(ni.source).then(x => x.trim());
				ni.wfun = (val) => {
					let w = ni.write;
					let e = w.match(reIsEvalWrite);
					while (e) {
						let a = e[1].replace(reIsArgWrite, val);
						a = eval(a);
						w = w.replace(reIsEvalWrite, a);
						e = w.match(reIsEvalWrite);
					}
					return A.exec(w).then(A.nop, A.D);
				};
				break;
			case 'file':
				ni.fun = () => A.readFile(ni.source, 'utf8').then(x => x.trim());
				ni.wfun = (val) => A.writeFile(ni.source, val.toString(), 'utf8');
				ni.wtext = 'eval';
				break;
			case 'web':
				ni.fun = () => A.get(ni.source);
				break;	

			case 'process':
				// break;
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

	for (let item of adapter.config.items) {
		let ni = A.clone(item);
		let ir = item.name.trim().match(reIsMultiName);
		if (!ir) {
			A.W(`Invalid item name in ${A.O(item)}`);
			continue;
		}
		if (ir[2]) {
			ni.id = A.trim(ir[2].slice(1, -1).split(',')).map(s => ir[1] + s + ir.slice(-1)[0]);
		} else ni.id = ir[1] + ir.slice(-1)[0];
		ni.write = ni.write && ni.write.trim();
		ni.source = ni.source.trim();
		ni.conv = ni.conv && ni.conv.trim();
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
			let r = ni.regexp && ni.regexp.trim(),
				m = r.match(reIsRegExp),
				o;
			if (m) {
				r = m[1];
				o = m[2];
			}
			ni.regexp = r.length > 0 ? new RegExp(r, o ? o : undefined) : null;
		} catch (e) {
			A.W(`Error ${e} in RegExp of ${A.O(ni)}`);
			ni.regexp = null;
		}
		opt.native.si = A.clone(ni);
		createFunction(ni);
		ni.opt = opt;
		list[ni.poll].push(ni);

	}

	A.D(`Will poll every ${pollfast}sec: ${list.fast.map(x => x.id)}.`);
	A.D(`Will poll every ${poll}min: ${list.normal.map(x => x.id)}.`);
	A.D(`Will poll every ${pollslow}min: ${list.slow.map(x => x.id)}.`);

	A.seriesOf(A.trim(adapter.config.startup.slice('\n')), x => A.exec(x).then(A.nop, A.D), 10)
		.then(() => doPoll())
		.then(() => A.getObjectList({
				startkey: A.ain,
				endkey: A.ain + '\u9999'
			})
			.then(res => A.seriesOf(res.rows, item => A.states[item.id.slice(A.ain.length)] ? Promise.resolve() :
				A.D(`Delete unneeded state ${item.id}`, A.removeState(item.id.slice(A.ain.length))), 2))
			.then(() => {
				if (list.normal.length > 0)
					pollF = setInterval(doPoll, poll * 1000 * 60, list.normal);
				if (list.fast.length > 0)
					pollfastF = setInterval(doPoll, pollfast * 1000, list.fast);
				if (list.slow.length > 0)
					pollslowF = setInterval(doPoll, pollslow * 1000 * 60, list.slow);

			})
			.then(() => A.I(`Adapter ${A.ains} started and found ${list.fast.length + list.normal.length + list.slow.length}/${states.length} items/states to process.`))
			.catch(e => A.W(`Unhandled error in main: ${e}`))
		);
}