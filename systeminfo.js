/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
/*jshint -W089, -W030, -W061, -W083 */
// jshint node:true, esversion:6, strict:true, undef:true, unused:true
"use strict";
const utils = require('./lib/utils'),
	adapter = utils.Adapter('systeminfo'),
	//	dns = require('dns'),
	assert = require('assert'),
	A = require('./myAdapter'),
	si = require('systeminformation'),
	cheerio = require('cheerio'),
	schedule = require('node-schedule'),
	xml2js = require('xml2js');


const list = {},
	scheds = {},
	states = {},
	roleNames = ["number", "switch", "boolean", "value.temperature", "json", "string"],
	roleRoles = ["value", "switch", "value", "value.temperature", "value", "value"],
	roleTypes = ["number", "boolean", "boolean", "number", "string", "string"],
	reIsEvalWrite = /@\((.+)\)/,
	reIsMultiName = /^([^\s,\[]+)\s*(\[\s*(\w+\s*\/\s*\w*|[^\s,\]]+(\s*\,\s*[^\s,\]]+)+|\*)\s*\]\s*)?(\S*)$/,
	reIsInfoName = /^(\w*)\s*(\(\s*([^\(\),\s]+)\s*(\,\s*\S+\s*)*\))?$/,
	reIsRegExp = /^\/(.*)\/([gimy])*$/,
	reIsObjName = /\s*(\w+)\s*\/\s*(\w*)\s*/,
	reStripPrefix = /(?!xmlns)^.*:/,
	reIsSchedule = /^[\d\-\/\*\,]+(\s+[\d\/\-\*,]+){4,5}$/,
	reIsTime = /^([\d\-\*\,\/]+)\s*:\s*([\d\-\*\,\/]+)\s*(?::\s*([\d\-\*\,\/]+))?$/,
	reIsObject = /^\s*?\}.+\}$/;

A.init(adapter, main); // associate adapter and main with MyAdapter

function xmlParseString(body) {

	let valp = (str /* , name */ ) => !isNaN(str) ? A.number(str) : /^(?:true|false)$/i.test(str) ? str.toLowerCase() === 'true' : str,
		options = {
			explicitArray: false,
			explicitRoot: false,
			//			ignoreAttrs: true,
			attrkey: '_',
			charkey: '#',
			childkey: '__',
			mergeAttrs: true,
			trim: true,
			//			validator: (xpath, currentValue, newValue) => A.D(`${xpath}: ${currentValue} = ${newValue}`,newValue),
			//			validator: (xpath, currentValue, newValue) => A.T(newValue,[]) && newValue.length==1 && A.T(newValue[0],[]) ? newValue[0] : newValue,
			//			attrNameProcessors: [str => str === '$' ? '_' : str], 
			tagNameProcessors: [(str) => str.replace(reStripPrefix, '')],
			//                attrNameProcessors: [tagnames],
			attrValueProcessors: [valp],
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
		if (this._cache[item] !== undefined)
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
	constructor(obj) {
		this.$ = A.T(obj, {}) || A.T(obj, []) ? A.clone(obj) : obj;
	}

	parse(expr) {
		this.result = [];

		if (this.$ && !expr)
			return [this.$];
		else if (!this.$)
			return false;

		var subx = [],
			subs = [],
			res = expr.replace(/([^\\]"|^"|\\\\")(\\"|[^"])+?"/g, ($0) => {
				let t = $0[1] === '"' ? $0[0] : '',
					s = t === '' ? $0.slice(1, -1) : $0.slice(2, -1);
				return t + "__" + (subs.push(s.replace(/\\"/g, '"')) - 1) + '__';
			});
		res = res.replace(/\s*([\w\$]+)\s*(\.\s*(\w|$)+\s*)*/g, (_0) => _0.split('.').map(a => a.trim()).join('\\§'));
		res = res.replace(/\[([\?\!]?\(.+?\))\]/g, ($0, $1) => "[#" + (subx.push($1.trim().replace(/,/g, '\\#').replace(/\./g, '\\§')) - 1));
		res = res.replace(/(\.|\];?)?\s*(\[|\];?|\]\s*\[)/g, ";");
		res = res.replace(/\.\.\.|\.\./g, ";;");
		res = res.replace(/;;;|;;/g, ";..;");
		res = res.replace(/;$|\]$/g, "");
		res = res.replace(/#(\d+?)/g, ($0, $1) => subx[$1]);
		res = res.replace(/__(\d+?)__/g, ($0, $1) => subs[$1]);
		res = res.replace(/\\§/g, '.');
		res = res.replace(/\\#/g, ',');
		res = res.replace(/^\$;/, "");
		//			A.D(`normalized= ${res}`, res);
		this.trace(res.split(';').map(s => s.trim()).filter(s => s.length), this.$, "$");
		return this.result.length ? this.result : false;
	}

	myeval(x, _v /* , _vname */ ) {
		let $ = this.$; //	    A.D(`eval:[${x}]`);
		try {
			let res = $ && _v && eval(x.replace(/\\\#/g, ',').replace(/@/g, "_v")); // A.D(`eval:[${x}] returns ${res} and had ${A.O(_v)}`);
			return res;
		} catch (e) {
			throw new SyntaxError("jsonPath: " + e.message + ": " + x.replace(/@/g, "_v").replace(/\^/g, "_a"));
		}
		return null;
	}

	trace(x, val) {
		function walk(loc, expr, val, f) {
			if (val instanceof Array)
				val.map((c, i) => c !== undefined ? f(i, loc, expr, val) : null);
			else if (typeof val === "object")
				Object.keys(val).map(m => val.hasOwnProperty(m) ? f(m, loc, expr, val) : null);
		}
		const that = this;
		if (!x || x.length === 0)
			return this.result.push(val);
		var loc = x.shift(); //		A.D(`loc: '${loc}', x:[${x}],  val:${val}`);
		if (loc === undefined || loc.length === 0)
			return this.trace(x, val);
		if (/^\(.*?\)$/.test(loc)) // [(expr)]
			this.trace([that.myeval(loc, val)].concat(x), val);
		else if (/^\?\(.*?\)$/.test(loc)) // [?(expr)]
			walk(loc, x, val, (m, l, x, v) => that.myeval(l.slice(2, -1), v[m]) ? that.trace([m].concat(x), v) : null);
		else if (/^\!\(.*?\)$/.test(loc)) { // [!(expr)]
			let res = that.myeval(loc.slice(2, -1), val);
			if (res) that.trace(Array.from(x), res);
		} else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) {
			let ov = Object.keys(val).filter(k => val.hasOwnProperty(k));
			let len = ov.length,
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
				this.trace([ov[j]].concat(x), val);
		} else if (val && val.hasOwnProperty(loc))
			this.trace(Array.from(x), val[loc]);
		else if (/^\d+$/.test(loc)) {
			let ov = Object.keys(val).filter(k => val.hasOwnProperty(k));
			this.trace([ov[parseInt(loc)]].concat(x), val);
		} else if (/,/.test(loc)) { // [name1,name2,...]
			loc.split(',').map(s => that.trace([s.trim()].concat(x), val));
		} else if (/[\w\$]+\s*\.\s*[\w\$]+/.test(loc)) {
			let o = loc.split('.').map(s => s.trim());
			if (val && val.hasOwnProperty(o[0]))
				this.trace([o.slice(1).join('.')].concat(x), val[o[0]]);
		} else if (loc === "*")
			walk(loc, x, val, (m, l, x, v) => that.trace([m].concat(x), v));
		else if (loc === "..") { //		    A.D(`I will do '..' on [${x}]`);
			this.trace(Array.from(x), val);
			walk(loc, x, val, (m, l, x, v) => typeof v[m] === "object" ? that.trace(['..'].concat(x), v[m]) : null);
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

class WebQuery {
	constructor(item) {
		this._$ = A.T(item, '') ? cheerio.load(item) : item;
	}

	static eval(fun, _v, con) {
		try {
			let res = eval(fun.replace(/@/g, '_v')); // A.D(`eval:[${x}] returns ${res} and had ${A.O(_v)}`);
			return res;
		} catch (e) {
			throw new SyntaxError(`eval: ${e.message}: ${fun} on ${_v} with ${con}`);
		}

	}
	handle(opt, con) {
		//		A.D(A.O(opt));
		function norm(opt, name) {
			let copt = {};
			if (A.T(opt, '')) {
				copt._sel = opt;
				opt = copt;
			} else if (!A.T(opt, {}))
				return copt;
			for (let i of A.ownKeys(opt))
				if (!i.startsWith('_'))
					copt[i] = opt[i];
			if (opt._notrim)
				copt._notrim = opt._notrim;
			if (name || opt._name)
				copt._name = name ? name : opt._name;
			if (opt._conv)
				copt._conv = opt._conv;
			if (opt._filter)
				copt._filter = opt._filter;
			if (opt._fun)
				copt._fun = opt._fun;
			if (opt._eq)
				copt._eq = opt._eq;
			if (opt._sel)
				copt._sel = opt._sel;
			return copt;
		}

		opt = norm(opt);
		let data = {},
			name,
			res = opt._sel ? this._$(opt._sel, con) : con ? con : this._$('body', con);

		if (A.T(opt._eq, 0))
			res = res.eq(opt._eq);

		for (name of A.ownKeys(opt)) {
			if (name.startsWith('_'))
				continue;

			let nopt = norm(opt[name]),
				m = name.match(/^([$\w]*)(\!?)\[(.+)\]$/),
				docs,
				items,
				item;

			if (m) {
				let nam = m[1].trim(),
					ex = m[2],
					sel = m[3].trim(),
					eq = parseInt(sel).toString() === sel;

				if (nam)
					name = nam;

				if (!ex && eq) {
					sel = parseInt(sel);
					let r = res.eq(sel);
					if (nam) {
						data[nam] = this.handle(nopt, r);
						continue;
					} else
						res = r;
				} else if (ex) {
					let r = WebQuery.eval(sel, res, con);
					if (nam) {
						data[nam] = this.handle(nopt, r);
						continue;
					} else
						res = r;
				} else {

					docs = data[name] = [];
					items = this._$(sel, res);

					if (items.length === 1) {
						let r = res.eq(0);
						if (nam) {
							data[nam] = this.handle(nopt, r);
							continue;
						} else
							res = r;
					} else
						for (let i = 0; i < items.length; ++i) {
							item = items.eq(i);
							if (opt._filter === undefined ||
								(A.T(opt._filter) === 'function' && opt._filter(item, this._$)) ||
								(A.T(opt._filter, '') && WebQuery.eval(opt._filter, item, con))) {
								let cdoc = this.handle(nopt, item);
								docs.push(cdoc);
							}

						}
					continue;
				}

			} else {
				data[name] = this.handle(nopt, res);
			}
		}
		if (A.ownKeys(data).length)
			return data;
		let value = typeof opt._fun === 'function' ? opt._fun(res) : A.T(opt._fun, '') ? WebQuery.eval(opt._fun, res) : res && res.text ? res.text() : res;

		if (!opt._notrim && A.T(value, ''))
			value = value.trim().replace(/[\s\n]+/g, ' ');

		if (opt._conv) {
			if (typeof opt._conv === 'function')
				value = opt._conv(value, res);
			else if (typeof opt._conv === 'string')
				value = WebQuery.eval(opt._conv, value, res);
		}
		return value;
	}
}

function writeInfo(id, state) {
	if (!states[id] || !states[id].wfun)
		return Promise.reject(`Err: no write function defined for ${id}!`);
	let obj = states[id];
	let val = state.val;
	A.D(`new state:${A.O(state)} for ${id}`);
	switch (obj.wtext) {
		case 'eval':
			val = WebQuery.eval(obj.write, val);
			break;
		default:
			break;
	}
	return obj.wfun && obj.wfun(val).then(() =>
			A.makeState(id, state.val, true))
		.catch(e => A.W(`wfun err ${e}`));
}

function setItem(item, name, value) {
	//	A.D(`setItem ${name} to ${A.O(value)} with ${item.type};${item.conv};${item.role}`);
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
			case 'html':
			case 'json':
			case 'xml':
				break;
			default:
				if (item.conv.indexOf('@') >= 0)
					try {
						value = WebQuery.eval(item.conv, value);
					} catch (e) {
						A.W(`convert '${item.conv}' for item ${name} failed with: ${e}`);
					}
				break;
		}
	let o = A.clone(item.opt);
	o.id = name;
	switch (A.T(value)) {
		case 'object':
		case 'array':
			value = JSON.stringify(value);
			break;
		case 'function':
			value = `${value}`;
			break;
		default:
			break;
	}
	return A.makeState(o, value, true);
}

function doPoll(plist) {

	function idid(id, n) {
		return id.pre + n + id.post;
	}

	if (!plist) {
		plist = [];
		for (let k of A.ownKeys(list))
			plist = plist.concat(list[k]);
	}
	if (plist.length === 0)
		return;
	//	A.D(`I should poll ${plist.map(x => x.id)} now!`);
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
							case 'html':
								typ = 'info';
								if (A.T(item.regexp, {})) {
									res = item.regexp.conv(res);
								}
								break;
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
									res = jp ? jp[1] : res;
									//								} else if ((jp = item.conv.match(reIsEvalWrite))) {
									//									res = WebQuery.eval(jp[1],res);
								}
								break;
						}
						return res;
					}, e => A.W(`Error ${e} in doPoll for ${item.name}`))
					.then(res => {
						A.D(`${item.name}  received ${A.O(res,1)}`);
						if (typ === 'info') {
								jp = new JsonPath(res);
								ma = jp.parse(item.conv === 'html' ? item.regexp.selection : item.regexp);
								if (ma && ma.length > 0)
									res = ma;
						} else {
								ma = item.regexp && res.match(item.regexp);
								ma = ma && ma.length > 1 ? ma.slice(1) : null;
								res = ma ? ma : res;
						}
						if (ma && A.T(item.id, {})) {
							let mat = A.T(ma[0]);
							if (mat === 'object' && ma.length === 1 && id.mid === '*') {
								ma = ma[0];
								return A.seriesOf(Object.keys(ma).filter(x => ma.hasOwnProperty(x)), i =>
									setItem(item, idid(id, i.replace(/[\. ]/g, '_')), ma[i]), 1);
							}
							if (id.name && mat === 'object') {
								if (!id.value)
									return A.seriesOf(ma, o => A.T(o, {}) ? A.seriesOf(Object.keys(o).filter(x => o.hasOwnProperty(x)),
										i => i !== id.name ? setItem(item, idid(id, o[id.name].replace(/[\. ]/g, '_') + '.' + i), o[i]) : A.resolve(), 1) : A.resolve(), 1);
								return A.seriesOf(ma, o =>
									setItem(item, idid(id, o[id.name].replace(/[\. ]/g, '_')), o[id.value]), 1);
							}
							//						if (io && A.T(item.id.mid, [])) {
							if (id.mid === '*')
								return A.seriesIn(ma, i =>
									setItem(item, idid(id, i), ma[parseInt(i)]), 1);

							if (A.T(item.id.mid, []))
								return A.seriesIn(item.id.mid, i => {
									i = parseInt(i);
									return setItem(item, idid(id, id.mid[i]), ma[i]);
								}, 1);
							res = ma;
						} else if (ma)
							res = A.T(ma, []) && ma.length === 1 && typ === 'info' ? ma[0] : ma;
						if (A.T(item.id, ""))
							return setItem(item, item.id, res);
						return setItem(item, idid(id, '?'), res);
					});
			}).catch(e => A.W(`Error ${e} in doPoll for ${item.name}`));
	}, 1);
}

function main() {

	A.I(`Startup Systeminfo Adapter ${A.ains}: ${A.O(adapter.config)}`);

	if ((A.debug = adapter.config.startup.startsWith('debug!')))
		adapter.config.startup = adapter.config.startup.slice(A.D(`Debug mode on!`, 6));

	for (let item of adapter.config.items) {
		if (item.name.startsWith('-'))
			continue;
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
		let ra = A.trim(A.T(ni.role, "") ? ni.role.split('|') : 'value'),
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
		if (ni.type === 'info' || ni.conv === 'xml' || ni.conv === 'json' || ni.conv === 'html')
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
		switch (ni.type) {
			case 'exec':
				ni.fun = () =>
					A.exec(ni.source).then(x => x.trim());
				ni.wfun = (val) => {
					let w = ni.write;
					let e = w.match(reIsEvalWrite);
					while (e) {
						let a = WebQuery.eval(e[1], val);
						w = w.replace(reIsEvalWrite, a);
						e = w.match(reIsEvalWrite);
					}
					return A.exec(w).then(A.nop, A.D);
				};
				break;
			case 'file':
				ni.fun = () =>
					A.readFile(ni.source, 'utf8').then(x => x.trim());
				ni.wfun = (val) =>
					A.writeFile(ni.source, val.toString(), 'utf8');
				ni.wtext = 'eval';
				break;
			case 'web':
				ni.fun = () => {
					let m = ni.source.match(reIsObject);
					if (m) {
						m = WebQuery.eval(ni.source);
						return A.request(m, m.data);
					}
					return A.request(ni.source);
				};
				if (ni.conv === 'html' && /^\{.+\}$/.test(ni.regexp))
					try {
						let cmd = WebQuery.eval('(' + ni.regexp + ')'),
							keys = A.ownKeys(cmd),
							sel = keys[0],
							webQuery = cmd[sel];
						if (keys.length === 1 && A.T(webQuery, {}))
							ni.regexp = {
								selection: sel,
								conv: (res) => (new WebQuery(res)).handle(webQuery)
							};
						else A.W(`Invalid Web query in regexp for ${ni.name}`);
					} catch (e) {
						A.W(`Invalid Web query for ${ni.name} cased error ${e}`);
					}
				break;

			case 'info':
				ni.fun = () => {
					let m = ni.source.match(reIsInfoName);
					if (!m)
						return A.W(`Invalid function statement in ${ni.name} for '${reIsInfoName}'`, A.resolve(null));
					if (A.T(si[m[1]]) !== 'function')
						return A.W(`Invalid function of 'systeminformation' in ${ni.name} for '${reIsInfoName}'`, A.resolve(null));
					return A.P(si[m[1]].apply(si, m[2] ? A.trim(m[2].slice(1, -1).split(',')) : [])).then(A.nop, A.nop);
				};
				break;
			default:
				A.W(`Not implemented type ${ni.type}`);
		}

		ni.opt = opt;
		let sch = item.sched ? item.sched.trim() : '',
			scht = sch.match(reIsTime);
		if (scht) {
			if (scht[3] === undefined)
				scht[3] = A.obToArray(list).length % 58 + 1;
			sch = `${scht[3]} ${scht[2]} ${scht[1]} * * *`;
		} else if (sch.match(/^\d+[smh]$/))
			switch (sch.slice(-1)) {
				case 's':
					sch = `*/${sch.slice(0,-1)} * * * * *`;
					break;
				case 'm':
					sch = `*/${sch.slice(0,-1)} * * * *`;
					break;
				case 'h':
					sch = `0 */${sch.slice(0,-1)} * * *`;
					break;
			}
		if (sch && sch.match(reIsSchedule)) {
			opt.native.si.sched = sch;
			if (list[sch])
				list[sch].push(ni);
			else
				list[sch] = [ni];
			scheds[sch] = null;
		} else A.W(`Invalid schedule in item ${item.name}`);

	}
	if (A.debug)
		A.makeState("_config", JSON.stringify({
			startup: adapter.config.startup,
			items: adapter.config.items
		}), true);
	A.seriesOf(A.trim(adapter.config.startup.split('\n')), x =>
			!x.startsWith('#') ? A.exec(x).then(A.nop, A.D) : A.resolve(), 10)
		.then(() => doPoll())
		.then(() => A.getObjectList({
				startkey: A.ain,
				endkey: A.ain + '\u9999'
			})
			.then(res => A.seriesOf(res.rows, item => A.states[item.id.slice(A.ain.length)] ? A.resolve() :
				A.D(`Delete unneeded state ${item.id}`, A.removeState(item.id.slice(A.ain.length))), 2))
			.then(() => {
				for (let sh in list) {
					A.D(`Will poll every '${sh}': ${list[sh].map(x => x.name)}.`);
					scheds[sh] = schedule.scheduleJob(sh, () => doPoll(list[sh]));
				}
			})
			.then(() => A.I(`Adapter ${A.ains} started and found ${A.obToArray(list).reduce((acc,val) => acc + val.length,0)}/${A.obToArray(states).length} items/states to process.`))
			.catch(e => A.W(`Unhandled error in main: ${e}`))
		);
}
