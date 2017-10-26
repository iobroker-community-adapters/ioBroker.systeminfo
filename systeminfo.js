/**
 *      iobroker bmw Adapter
 *      (c) 2016- <frankjoke@hotmail.com>
 *      MIT License
 */
// jshint node:true, esversion:6, strict:true, undef:true, unused:true
"use strict";
const utils = require('./lib/utils'),
	adapter = utils.adapter('systeminfo'),
	dns = require('dns'),
	assert = require('assert'),
	A = require('./myAdapter');

const scanList = {},
	tempName = '.Temperature',
	humName = '.Humidity',
	lightName = '.Light',
	airQualityName = '.AirQuality',
	noiseName = '.Noise',
	learnRf = 'RF',
	learnIr = '',
	learnName = '.Learn',
	sendName = '.SendCode',
	sceneName = 'SendScene',
	scenesName = 'Scenes',
	statesName = 'States',
	reIsEvalWrite = /\$\((.+)\)/,
	reIsArgWrite = /\$0/g,
	reIsCODE = /^CODE_[a-f0-9]{16}/,
	defaultName = '>>>Rename learned ';

let currentDevice, adapterObjects, firstCreate, pollerr = 2,
	states = {},poll=30, pollfast=2, pollslow=60;

A.init(adapter, main); // associate adapter and main with MyAdapter
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
function main() {
	let notFound,doPoll,didFind;
	A.I('Startup Systeminfo Adapter ' + A.ains);

	if ((A.debug = adapter.config.startup.startsWith('debug!')))
		adapter.config.startup = adapter.config.startup.slice(A.D(`Debug mode on!`, 6));

	A.D('Config IP-Address end to remove: ' + adapter.config.ip);
	A.seriesOf(adapter.config.scenes, scene =>
			A.makeState({
				id: scenesName + '.' + scene.name.trim(),
				write: true,
				role: 'button',
				type: typeof true,
				native: {
					scene: scene.scene
				}
			}), 100)
//		.then(() => genStates(adapter.config.switches))
		.then(() => A.getObjectList({
			startkey: A.ain,
			endkey: A.ain + '\u9999'
		}))
		.then(res => adapterObjects = res.rows.length > 0 ? A.D(`Adapter has  ${res.rows.length} old states!`, adapterObjects = res.rows.map(x => x.doc)) : [])
//		.then(() => didFind = Object.keys(scanList))
		.then(() => A.seriesOf(adapterObjects.filter(x => x.native && x.native.host), dev => {
			let id = dev.native.host.name; // dev._id.slice(A.ain.length);
			if (!scanList[id] && !id.endsWith(learnName + learnRf) && !id.endsWith(learnName + learnIr)) {
				let device = {
					name: id,
					fun: A.nop,
					host: dev.native.host,
					dummy: true,
					checkRequest: 1,
				};
				A.W(`device ${id} not found, please rescan later again or delete it! It was: ${A.obToArray(device.host)}`);
				scanList[id] = device;
//				notFound.push(id);
			}
			return Promise.resolve(true);
		}, 1))
//		.then(() => doPoll())
		.then(() => A.makeState({
			id: sceneName,
			write: true,
			role: 'text',
			type: typeof '',
		}, ' ', true))
		.then(() => {
			const p = parseInt(adapter.config.poll);
			if (p) {
				setInterval(doPoll, p * 1000);
				A.D(`Poll every ${p} secods.`);
			}
		})
		.then(() => (A.I(`Adapter ${A.ains} started and found ${didFind.length} devices named '${didFind.join("', '")}'.`),
			notFound.length > 0 ? A.I(`${notFound.length} were not found: ${notFound}`) : null), e => A.W(`Error in main: ${e}`))
		.catch(e => A.W(`Unhandled error in main: ${e}`));
}