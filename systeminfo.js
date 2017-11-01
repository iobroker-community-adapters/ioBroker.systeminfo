/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
/*jshint -W089, -W030, -W061 */
// jshint node:true, esversion:6, strict:true, undef:true, unused:true
"use strict";
const utils = require('./lib/utils'),
	adapter = utils.adapter('systeminfo'),
	//	dns = require('dns'),
	assert = require('assert'),
	A = require('./myAdapter'),
	si = require('systeminformation'),
	xml2js = require('xml2js');


const list = {
		normal: [],
		fast: [],
		slow: []
	},
	states = {},
	roleNames = ["number", "switch", "boolean", "value.temperature"],
	roleRoles = ["value", "switch", "value", "value.temperature"],
	roleTypes = ["number", "boolean", "boolean", "number"],
	reIsEvalWrite = /\$\((.+)\)/,
	reIsMultiName = /^([^\s,\[]+)\s*(\[\s*(\w+\s*\/\s*\w*|[^\s,\]]+(\s*\,\s*[^\s,\]]+)+|\*)\s*\]\s*)?(\S*)$/,
	reIsInfoName = /^(\w*)\s*(\(\s*([^\(\),\s]+)\s*(\,\s*\S+\s*)*\))?$/,
	reIsRegExp = /^\/(.*)\/([gimy])*$/,
	reIsObjName = /\s*(\w+)\s*\/\s*(\w*)\s*/,
	reStripPrefix = /(?!xmlns)^.*:/,
	reIsArgWrite = /\$0/g;

let pollF, pollfastF, pollslowF,
	poll = 30,
	pollfast = 2,
	pollslow = 60;

A.init(adapter, main); // associate adapter and main with MyAdapter

function xmlParseString(body) {

	let valp = (str /* , name */) => !isNaN(str) ? A.number(str) : /^(?:true|false)$/i.test(str) ? str.toLowerCase() === 'true' : str,
		options = {
			explicitArray: false,
			explicitRoot: false,
//			ignoreAttrs: true,
			mergeAttrs: true, 
			trim: true,
//			validator: (xpath, currentValue, newValue) => A.D(`${xpath}: ${currentValue} = ${newValue}`,newValue),
//			validator: (xpath, currentValue, newValue) => A.T(newValue,[]) && newValue.length==1 && A.T(newValue[0],[]) ? newValue[0] : newValue,
//			attrNameProcessors: [str => str === '$' ? '_' : str], 
			tagNameProcessors: [(str) => str.replace(reStripPrefix,'')],
			//                attrNameProcessors: [tagnames],
			attrValueProcessors : [valp],
			valueProcessors: [valp]
		},
		parser = new xml2js.Parser(options).parseString; 

	return (A.c2p(parser))(body);
}



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
			return A.resolve(this._cache[item]);
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

class JsonPath {
	constructor(obj, opt) {
		this.$ = (obj && A.T(obj) === 'object') ? A.clone(obj) : {
			empty: "Empty Object"
		};
		this.resultPath = opt === "PATH" || opt && opt.resultType === "PATH";
	}

	parse(expr) {
		this.result = [];

		if (expr && this.$) {
			this.trace(this.normalize(expr).replace(/^\$;/, ""), this.$, "$");
		}
		return this.result.length ? this.result : false;
	}

	normalize(expr) {
		var subx = [];
		return expr.replace(/[\['](\??\(.*?\))[\]']/g, function ($0, $1) {
				return "[#" + (subx.push($1) - 1) + "]";
			})
			.replace(/'?\.'?|\['?/g, ";")
			.replace(/;;;|;;/g, ";..;")
			.replace(/;$|'?\]|'$/g, "")
			.replace(/#([0-9]+)/g, function ($0, $1) {
				return subx[$1];
			});
	}

	store(p, v) {
		if (!p)
			return false;
		if (!this.resultPath)
			this.result.push(v);
		else {
			let x = p.split(";");
			p = "$";
			for (var i = 1, n = x.length; i < n; i++)
				p += /^[0-9*]+$/.test(x[i]) ? ("[" + x[i] + "]") : ("['" + x[i] + "']");
			this.result.push(p);
		}
		return true;
	}

	trace(expr, val, path) {
		const that = this;
		if (expr) {
			var x = expr.split(";"),
				loc = x.shift();
			x = x.join(";");
			if (val && val.hasOwnProperty(loc))
				this.trace(x, val[loc], path + ";" + loc);
			else if (loc === "*")
				this.walk(loc, x, val, path, function (m, l, x, v, p) {
					that.trace(m + ";" + x, v, p);
				});
			else if (loc === "..") {
				this.trace(x, val, path);
				this.walk(loc, x, val, path, function (m, l, x, v, p) {
					typeof v[m] === "object" && that.trace("..;" + x, v[m], p + ";" + m);
				});
			} else if (/,/.test(loc)) { // [name1,name2,...]
				for (var s = loc.split(/'?,'?/), i = 0, n = s.length; i < n; i++)
					this.trace(s[i] + ";" + x, val, path);
			} else if (/^\(.*?\)$/.test(loc)) // [(expr)]
				this.trace(this.eval(loc, val, path.substr(path.lastIndexOf(";") + 1)) + ";" + x, val, path);
			else if (/^\?\(.*?\)$/.test(loc)) // [?(expr)]
				this.walk(loc, x, val, path, function (m, l, x, v, p) {
					if (that.eval(l.replace(/^\?\((.*?)\)$/, "$1"), v[m], m)) that.trace(m + ";" + x, v, p);
				});
			else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) {
				let len = val.length,
					start = 0,
					end = len,
					step = 1;
				loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, function ($0, $1, $2, $3) {
					start = parseInt($1 || start);
					end = parseInt($2 || end);
					step = parseInt($3 || step);
				});
				start = (start < 0) ? Math.max(0, start + len) : Math.min(len, start);
				end = (end < 0) ? Math.max(0, end + len) : Math.min(len, end);
				for (var j = start; j < end; j += step)
					this.trace(j + ";" + x, val, path);
			}
		} else
			that.store(path, val);
	}

	walk(loc, expr, val, path, f) {
		if (val instanceof Array) {
			for (var i = 0, n = val.length; i < n; i++)
				if (i in val)
					f(i, loc, expr, val, path);
		} else if (typeof val === "object") {
			for (var m in val)
				if (val.hasOwnProperty(m))
					f(m, loc, expr, val, path);
		}
	}

	eval(x, _v /* , _vname */ ) {
		try {
			return this.$ && _v && eval(x.replace(/@/g, "_v"));
		} catch (e) {
			throw new SyntaxError("jsonPath: " + e.message + ": " + x.replace(/@/g, "_v").replace(/\^/g, "_a"));
		}
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
	A.D(`new state:${A.O(state)} for ${id}`);
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

	function idid(id, n) {
		return id.pre + n + id.post;
	}

	function setItem(item, name, value) {
		A.D(`setItem ${name} to ${A.O(value)} with ${item.type};${item.conv};${item.role}`);
		if (!states[name])
			states[name] = item;
		if (item.conv)
			switch (item.conv.trim().toLowerCase()) {
				case 'number':
					value = isNaN(value) ? NaN : A.number(value);
					break;
				case 'boolean':
					value = A.parseLogic(value);
					break;
				case '!boolean':
					value = !A.parseLogic(value);
					break;
				case 'json':
				case 'xml':
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
		switch(A.T(value)) {
			case 'object':
			case 'array':
				value = A.O(value);
				break;
			case 'function':
				value = `${value}`;
				break;
			default: 
				break;
		}
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
					let ma, jp,
						id = item.id,
						typ = item.type;
					return A.resolve(res).then(res => {
						switch (item.conv) {
							case 'json':
								res = A.J(res);
								typ = 'info';
								break;
							case 'xml':
							typ = 'info';
							return xmlParseString(res).then(json => (res = json, json));
							default:
								if ((jp = item.conv.match(reIsRegExp))) {
									jp = new RegExp(jp[1], jp[2]);
									jp = res.match(jp);
									res = jp ? jp[2] : res;
								}
								break;
						}
						return res;
					}).then(res => {
						A.D(`${item.name}  received ${A.O(res,1)}`);
						switch (typ) {
							case 'info':
								jp = new JsonPath(res);
								ma = jp.parse(item.regexp);
//								A.D(`ma=${ma}`);
								if (!ma || ma.length === 0)
									res = ma;
								break;
							default:
								ma = item.regexp && res.match(item.regexp);
								ma = ma ? ma.slice(1) : null;
								break;
						}
						if (ma && A.T(item.id, {})) {
							let mat = A.T(ma[0]);
							if (mat === 'object' && id.mid === '*') 
								return A.seriesOf(Object.keys(ma).filter(x => ma.hasOwnProperty(x)), i => setItem(item, idid(id, i), ma[i]), 1);
							
							if (id.name && mat === 'object') {
								if (!id.value)
									return A.seriesOf(ma, o => A.T(o, {}) ? A.seriesOf(Object.keys(o).filter(x => o.hasOwnProperty(x)),
										i => i !== id.name ? setItem(item, idid(id, o[id.name] + '.' + i), o[i]) : A.resolve(), 1) : A.resolve(), 1);
								return A.seriesOf(ma, o => setItem(item, idid(id, o[id.name]), o[id.value]), 1);
							}
							//						if (io && A.T(item.id.mid, [])) {
							if (id.mid === '*')
								return A.seriesIn(ma, i => setItem(item, idid(id, i), ma[parseInt(i)]), 1);

							if (A.T(item.id.mid, []))
								return A.seriesIn(item.id.mid, i => {
									i = parseInt(i);
									return setItem(item, idid(id, id.mid[i]), ma[i]);
								}, 1);
							res = ma;
						} else if(ma) 
							res = ma;
						if (A.T(item.id, ""))
							return setItem(item, item.id, res);
						return setItem(item, idid(id,'?'), res);
						});
				});
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

			case 'info':
				ni.fun = () => {
					function doCmd(cmd) {
						let m = cmd.match(reIsInfoName),
							r = {};
						if (!m)
							return A.D(`Invalid function statement in ${ni.name} for '${cmd}'`, null);
						if (A.T(si[m[1]]) !== 'function')
							return A.D(`Invalid function of 'systeminformation' in ${ni.name} for '${cmd}'`, null);
						r.fun = m[1];
						r.args = m[2] ? A.trim(m[2].slice(1, -1).split(',')) : [];
						return r;
					}
					let cmds = A.trim(ni.source.split(',')).map(cmd => doCmd(cmd)).filter(x => !!x),
						res = {};
					if (cmds.length < 1)
						return Promise.reject(`No valid function found in  'systeminformation' in ${ni.name} for '${ni.source}'`, null);

					return A.seriesOf(cmds, x => A.P(si[x.fun].apply(si, x.args)).then(r => res[x.fun] = r), 1).then(() => res, () => {});
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

	for (let item of adapter.config.items) {
		let ni = A.clone(item);
		let ir = item.name.trim().match(reIsMultiName);
		if (!ir) {
			A.W(`Invalid item name in ${A.O(item)}`);
			continue;
		}
		if (ir[2]) {
			let irn = {
				pre: ir[1],
				post: ir[5],
				mid: ir[3]
			};
			if (irn.mid !== '*') {
				let on = irn.mid.match(reIsObjName);
				if (on) {
					irn.name = on[1];
					irn.value = on[2] !== '' ? on[2] : null;
				} else {
					irn.mid = A.trim(irn.mid.split(','));
				}
			}
			ni.id = irn;
		} else ni.id = ir[1];
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
		if (ni.type==='info' || ni.conv === 'xml' || ni.conv === 'json') 
				ni.regexp = ni.regexp.trim();
		else {
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
			.then(res => A.seriesOf(res.rows, item => A.states[item.id.slice(A.ain.length)] ? A.resolve() :
				A.D(`Delete unneeded state ${item.id}`, A.removeState(item.id.slice(A.ain.length))), 2))
			.then(() => {
				if (list.normal.length > 0)
					pollF = setInterval(doPoll, poll * 1000 * 60, list.normal);
				if (list.fast.length > 0)
					pollfastF = setInterval(doPoll, pollfast * 1000, list.fast);
				if (list.slow.length > 0)
					pollslowF = setInterval(doPoll, pollslow * 1000 * 60, list.slow);

			})
			.then(() => A.I(`Adapter ${A.ains} started and found ${list.fast.length + list.normal.length + list.slow.length}/${A.obToArray(states).length} items/states to process.`))
			.catch(e => A.W(`Unhandled error in main: ${e}`))
		);
}