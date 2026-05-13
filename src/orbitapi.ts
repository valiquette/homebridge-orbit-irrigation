/* eslint-disable @typescript-eslint/no-explicit-any */
//Pulbic site https://techsupport.orbitbhyve.com
'use strict';
import { Logging } from 'homebridge';
import OrbitPlatform from './orbitplatform.js';
import { PLUGIN_NAME, PLUGIN_VERSION } from './settings.js';
import axios from 'axios';
import ws from 'ws';
import ReconnectingWebSocket from 'reconnecting-websocket';

const endpoint = 'https://api.orbitbhyve.com/v1';
const WS_endpoint = 'wss://api.orbitbhyve.com/v1/events';

const maxPingInterval = 30000;
const minPingInterval = 20000;
const pingInterval = Math.floor(Math.random() * (maxPingInterval - minPingInterval)) + minPingInterval; // Websocket get's timed out after 30s, will set a random value between 20 and 30

export default class OrbitAPI {
	constructor(
		private readonly platform: OrbitPlatform,
		private readonly log: Logging = platform.log,
		private wsp = new WebSocketProxy(platform, log),
	) {}

	async getToken(email: any, password: any) {
		// Get token
		try {
			this.log.debug('Retrieving API key');
			const response = await axios({
				method: 'post',
				baseURL: endpoint,
				url: '/session',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				data: {
					session: {
						email: email,
						password: password,
					},
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting API key - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get token response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	async getDevices(token: any, userId: string) {
		// Get the device details
		try {
			this.log.debug('Retrieving devices');
			const response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/devices?user=' + userId,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting devices - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get devices response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	async getDevice(token: any, device: string) {
		// Get the device details
		try {
			this.log.debug('Retrieving device');
			const response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/devices/' + device,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting device - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	async getMeshes(token: any, meshId: string) {
		// Get mesh details
		try {
			this.log.debug('Retrieving mesh info');
			const response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/meshes/' + meshId,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting mesh info - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get mesh info response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	async getNetworkTopologies(token: any, networkTopologyId: string) {
		// Get mesh details
		try {
			this.log.debug('Retrieving network topology info');
			const response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/network_topologies/' + networkTopologyId,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting network topologies info - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get network topology info response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	async getDeviceGraph(token: any, userId: any) {
		// Get device graph details
		try {
			this.log.debug('Retrieving device graph info');
			const response = await axios({
				method: 'post',
				baseURL: endpoint,
				url: '/graph2',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				data: {
					query: [
						'devices',
						{
							user_id: userId,
						},
						'id',
						'name',
						'address',
						'location_name',
						'type',
						'hardware_version',
						'firmware_version',
						'mac_address',
						'is_connected',
						'mesh_id',
					],
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting graph - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device graph response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	async getTimerPrograms(token: any, device: { id: any; }) {
		// Get mesh details
		try {
			this.log.debug('Retrieving schedules');
			const response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/sprinkler_timer_programs',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PLUGIN_NAME}/${PLUGIN_VERSION}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard',
				},
				params: {
					device_id: device.id,
				},
				responseType: 'json',
			}).catch(err => {
				this.log.error('Error getting schedules - %s', err.message);
				this.log.debug(JSON.stringify(err, null, 2));
				if (err.response) {
					this.log.debug(JSON.stringify(err.response.data, null, 2));
				} else if (err.code) {
					this.log.debug(err.code);
				} else {
					this.log.warn('Error %s', err.name);
				}
				throw err?.code ?? err;
			});
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get timer programs response', JSON.stringify(response.data, null, 2));
				}
				return response.data;
			}
		} catch (err: any) {
			this.log.debug(err);
			throw err;
		}
	}

	startZone(token: any, device: { id: any; }, station: any, runTime: number) {
		try {
			this.log.debug('startZone', device.id, station, runTime);
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; mode: string; device_id: any; stations: { station: any; run_time: any; }[]; }) => any; }) =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						stations: [
							{
								station: station,
								run_time: runTime,
							},
						],
					}),
				)
				.catch((err: any) => {
					this.log.error('Error starting zone \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	startSchedule(token: any, device: { id: any; }, program: string) {
		try {
			this.log.debug('startZone', device.id, program);
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; mode: string; device_id: any; program: any; }) => any; }) =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						program: program,
					}),
				)
				.catch((err: any) => {
					this.log.error('Error starting zone \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	stopZone(token: any, device: { id: any; }) {
		try {
			this.log.debug('stopZone');
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; mode: string; device_id: any; timestamp: string; }) => any; }) =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						timestamp: new Date().toISOString(),
					}),
				)
				.catch((err: any) => {
					this.log.error('Error starting zone \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	startMultipleZone(token: any, device: { zones: any[]; id: any; }, runTime: number) {
		try {
			const body: { station: any; run_time: any; }[] = [];
			device.zones.forEach((zone: { enabled: boolean; station: any; }) => {
				zone.enabled = true; // need orbit version of enabled
				if (zone.enabled) {
					body.push({
						station: zone.station,
						run_time: runTime,
					});
				}
			});
			this.log.debug('multiple zone run data', JSON.stringify(body, null, 2));
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; mode: string; device_id: any; stations: any[]; }) => any; }) =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						stations: body,
					}),
				)
				.catch((err: any) => {
					this.log.error('Error starting multiple zone \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	stopDevice(token: any, device: { id: any; }) {
		try {
			this.log.debug('stopZone');
			this.wsp
				.connect(token, device)
				.then((ws: {
						send: (arg0: {
							event: string; mode: string; device_id: any;
							//stations: [],
							timestamp: string;
						}) => any;
					}) =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						//stations: [],
						timestamp: new Date().toISOString(),
					}),
				)
				.catch((err: any) => {
					this.log.error('Error stopping device \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	deviceStandby(token: any, device: { id: any; }, mode: string) {
		try {
			this.log.debug('standby');
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; mode: any; device_id: any; timestamp: string; }) => any; }) =>
					ws.send({
						event: 'change_mode',
						mode: mode,
						device_id: device.id,
						timestamp: new Date().toISOString(),
					}),
				)
				.catch((err: any) => {
					this.log.error('Error setting standby \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	openConnection(token: any, device: any) {
		try {
			this.log.debug('Opening WebSocket Connection');
			this.wsp
				.connect(token, device)
				/*
				.then(ws =>
					ws.send({
						event: 'app_connection',
						orbit_session_token: token
					})
				)
				*/
				.catch((err: any) => {
					this.log.error('Error opening connection \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	onMessage(token: any, device: any, listener: (arg0: any, arg1: any) => void) {
		try {
			this.log.debug('Adding Event Listener for %s', device.name);
			this.wsp
				.connect(token, device)
				.then((ws: { addEventListener: (arg0: string, arg1: (msg: any) => void) => any; }) =>
					ws.addEventListener('message', (msg: { data: any; }) => {
						listener(msg.data, device.id);
					}),
				)
				.catch((err: any) => {
					this.log.error('Error configuring listener \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	sync(token: any, device: any) {
		try {
			this.log.debug('Syncing device %s info', device.name);
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; device_id: any; }) => any; }) =>
					ws.send({
						event: 'sync',
						device_id: device.id,
					}),
				)
				.catch((err: any) => {
					this.log.error('Error syncing data \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}

	identify(token: any, device: any) {
		try {
			this.log.debug('Identify device %s info', device.name);
			this.wsp
				.connect(token, device)
				.then((ws: { send: (arg0: { event: string; device_id: any; identify_time_ms: number; }) => any; }) =>
					ws.send({
						event: 'fs_identify',
						device_id: device.id,
						identify_time_ms: 5000,
					}),
				)
				.catch((err: any) => {
					this.log.error('Error identify data \n%s', err);
				});
		} catch (err) {
			this.log.error('something went wrong \n%s', err);
		}
	}
}

export class WebSocketProxy {
	constructor(
		private readonly platform: OrbitPlatform,
		private readonly log: Logging,
		private rws: any = null,
		private ping: any = null,
	){}

	async connect(token: any, device: any) {
		try {
			if (this.rws) {
				this.log.debug('%s ready state', device, this.rws.readyState);
				switch (this.rws.readyState) {
				case ws.CONNECTING:
					return this.rws;
				case ws.OPEN:
					return this.rws;
				case ws.CLOSING:
					this.rws.reconnect();
					return this.rws;
				case ws.CLOSED:
					this.rws.reconnect();
					return this.rws;
				}
			}
			return new Promise((resolve, reject) => {
				try {
					const options = {
						WebSocket: ws,
						maxReconnectionDelay: 10000, //64000
						minReconnectionDelay: Math.floor(1000 + Math.random() * 4000),
						reconnectionDelayGrowFactor: 1.3,
						minUptime: 5000,
						connectionTimeout: 8000, //4000-10000
						maxRetries: Infinity,
						maxEnqueuedMessages: 1,
						startClosed: false,
						debug: false,
					};
					this.rws = new (ReconnectingWebSocket as any)(WS_endpoint, [], options);
					// Intercept send events for logging
					const origSend = this.rws.send.bind(this.rws);
					this.rws.send = (data: string, options: any, callback: any) => {
						switch (this.rws.readyState) {
						case ws.CONNECTING:
							setTimeout(() => {
								if (typeof data === 'object') {
									data = JSON.stringify(data, null, 2);
								}
								if (this.platform.showOutgoingMessages) {
									//this.log.debug(JSON.parse(data).event)
									if (JSON.parse(data).event != 'ping') {
										this.log.debug('sending outgoing message %s', data);
									}
								}
								origSend(data, options, callback);
							}, 2000);
							break;
						case ws.OPEN:
							if (typeof data === 'object') {
								data = JSON.stringify(data, null, 2);
							}
							if (this.platform.showOutgoingMessages) {
								//this.log.debug(JSON.parse(data).event)
								if (JSON.parse(data).event != 'ping') {
									this.log.debug('sending outgoing message %s', data);
								}
							}
							origSend(data, options, callback);
							break;
						case ws.CLOSING:
							break;
						case ws.CLOSED:
							this.log.info('connection not opened');
							break;
						}
					};

					this.rws.onopen = (event: { type: any; }) => {
						try {
							this.rws.send({
								event: 'app_connection',
								orbit_session_token: token,
							});
							this.log.debug(
								'connection open',
								JSON.stringify(
									{
										type: event.type,
									},
									null,
									2,
								),
							);
							this.log.info('WebSocket opened');
							// start ping
							this.ping = setInterval(() => {
								this.rws.send({ event: 'ping' });
							}, pingInterval);
							resolve(this.rws);
						} catch (err) {
							this.log.error('Error with open event \n%s', err);
						}
					};

					this.rws.onclose = (event: { type: any; wasClean: any; code: number; reason: any; }) => {
						try {
							this.log.debug(
								'connection closed',
								JSON.stringify(
									{
										type: event.type,
										wasClean: event.wasClean,
										code: event.code,
										reason: event.reason,
									},
									null,
									2,
								),
							);
							clearInterval(this.ping);
							if ((event.code == 1000 || event.code == 1005 || event.code == 1006) && this.rws.readyState == 3) {
								this.log.info('WebSocket closed');
								this.log.warn('Devices will not sync until WebSocket connection is restored.');
							}
						} catch (err) {
							this.log.error('Error with close event \n%s', err);
						}
					};

					this.rws.onmessage = (msg: { data: string; }) => {
						try {
							if (this.platform.showIncomingMessages) {
								this.log.debug('incoming message', JSON.parse(msg.data));
							}
						} catch (err){
							this.log.error('Error with ,essage event \n%s', err);
						}
					};

					this.rws.onerror = (event: { error: any; }) => {
						try {
							this.log.debug('ready state', this.rws.readyState);
							this.log.debug('connection error', event.error);
							switch (this.rws.readyState) {
							case ws.CONNECTING:
								this.log.debug('WebSocket connecting');
								break;
							case ws.OPEN:
								this.log.debug('WebSocket opened');
								break;
							case ws.CLOSING:
								this.log.debug('WebSocket closing');
								break;
							case ws.CLOSED:
								this.log.debug('WebSocket closed');
								break;
							}
							reject(event);
						} catch (err) {
							this.log.error('Error with error event \n%s', err);
						}
					};
				} catch (error: any) {
					this.log.error('caught', error.message);
					if (this.rws) {
						//check if connected
						if (this.rws.readyState == ws.OPEN) {
							this.log.warn('error, closing connection');
							this.rws.close((1000), ('Session terminated by client'));
							try {
								clearInterval(this.ping);
								this.rws = null;
							} catch (err) {
								this.log.error('Error closing connection \n%s', err);
							}
						}
					}
				}
			});
		} catch (err) {
			this.log.error('Opps', err);
		}
	}
}