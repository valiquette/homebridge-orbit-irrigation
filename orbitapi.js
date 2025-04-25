//Pulbic site https://techsupport.orbitbhyve.com
'use strict'

let axios = require('axios')
let ws = require('ws')
let reconnectingwebsocket = require('reconnecting-websocket')

let endpoint = 'https://api.orbitbhyve.com/v1'
let WS_endpoint = 'wss://api.orbitbhyve.com/v1/events'

let maxPingInterval = 30000 // Websocket get's timed out after 30s, will set a random value between 20 and 30
let minPingInterval = 20000

class OrbitAPI {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.wsp = new WebSocketProxy(platform, log)
	}

	async getToken(email, password) {
		// Get token
		try {
			this.log.debug('Retrieving API key')
			let response = await axios({
				method: 'post',
				baseURL: endpoint,
				url: '/session',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				data: {
					session: {
						email: email,
						password: password
					}
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting API key %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else {
					this.log.warn('%s - %s', err.name, err.code)
					return new Error('no network')
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get token response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving API key \n%s', err)
		}
	}

	async getDevices(token, userId) {
		// Get the device details
		try {
			this.log.debug('Retrieving devices')
			let response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/devices?user=' + userId,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting devices %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else if (err.code) {
					this.log.warn(err.code)
					return err
				} else {
					this.log.warn('Error %s', err.name)
					return err
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get devices response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving devices \n%s', err)
		}
	}

	async getDevice(token, device) {
		// Get the device details
		try {
			this.log.debug('Retrieving device')
			let response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/devices/' + device,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting device %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else if (err.code) {
					this.log.warn(err.code)
					return err
				} else {
					this.log.warn('Error %s', err.name)
					return err
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving device \n%s', err)
		}
	}

	async getMeshes(token, meshId) {
		// Get mesh details
		try {
			this.log.debug('Retrieving mesh info')
			let response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/meshes/' + meshId,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting mesh info %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else if (err.code) {
					this.log.warn(err.code)
					return 'err'
				} else {
					this.log.warn('Error %s', err.name)
					return err
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get mesh info response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving mesh info \n%s', err)
		}
	}

	async getNetworkTopologies(token, networkTopologyId) {
		// Get mesh details
		try {
			this.log.debug('Retrieving network topology info')
			let response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/network_topologies/' + networkTopologyId,
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting network topologies info %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else if (err.code) {
					this.log.warn(err.code)
					return err
				} else {
					this.log.warn('Error %s', err.name)
					return err
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get network topology info response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving network topologies info \n%s', err)
		}
	}

	async getDeviceGraph(token, userId) {
		// Get device graph details
		try {
			this.log.debug('Retrieving device graph info')
			let response = await axios({
				method: 'post',
				baseURL: endpoint,
				url: '/graph2',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				data: {
					query: [
						'devices',
						{
							user_id: userId
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
						'mesh_id'
					]
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting graph %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else if (err.code) {
					this.log.warn(err.code)
					return err
				} else {
					this.log.warn('Error %s', err.name)
					return err
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get device graph response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving graph \n%s', err)
		}
	}

	async getTimerPrograms(token, device) {
		// Get mesh details
		try {
			this.log.debug('Retrieving schedules')
			let response = await axios({
				method: 'get',
				baseURL: endpoint,
				url: '/sprinkler_timer_programs',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `${PluginName}/${PluginVersion}`,
					'orbit-api-key': token,
					'orbit-app-id': 'Bhyve Dashboard'
				},
				params: {
					device_id: device.id
				},
				responseType: 'json'
			}).catch(err => {
				this.log.error('Error getting scheduled %s', err.message)
				this.log.debug(JSON.stringify(err, null, 2))
				if (err.response) {
					this.log.warn(JSON.stringify(err.response.data, null, 2))
					return err.response.data
				} else if (err.code) {
					this.log.warn(err.code)
					return err
				} else {
					this.log.warn('Error %s', err.name)
					return err
				}
			})
			if (response.status == 200) {
				if (this.platform.showAPIMessages) {
					this.log.debug('get timer programs response', JSON.stringify(response.data, null, 2))
				}
				return response.data
			}
		} catch (err) {
			this.log.error('Error retrieving schedules \n%s', err)
		}
	}

	startZone(token, device, station, runTime) {
		try {
			this.log.debug('startZone', device.id, station, runTime)
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						stations: [
							{
								station: station,
								run_time: runTime
							}
						]
					})
				)
				.catch(err => {
					this.log.error('Error starting zone \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	startSchedule(token, device, program) {
		try {
			this.log.debug('startZone', device.id, program)
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						program: program
					})
				)
				.catch(err => {
					this.log.error('Error starting zone \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	stopZone(token, device) {
		try {
			this.log.debug('stopZone')
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						timestamp: new Date().toISOString()
					})
				)
				.catch(err => {
					this.log.error('Error starting zone \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	startMultipleZone(token, device, runTime) {
		try {
			let body = []
			device.zones.forEach(zone => {
				zone.enabled = true // need orbit version of enabled
				if (zone.enabled) {
					body.push({
						station: zone.station,
						run_time: runTime
					})
				}
			})
			this.log.debug('multiple zone run data', JSON.stringify(body, null, 2))
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						stations: body
					})
				)
				.catch(err => {
					this.log.error('Error starting multiple zone \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	stopDevice(token, device) {
		try {
			this.log.debug('stopZone')
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'change_mode',
						mode: 'manual',
						device_id: device.id,
						//stations: [],
						timestamp: new Date().toISOString()
					})
				)
				.catch(err => {
					this.log.error('Error stopping device \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	deviceStandby(token, device, mode) {
		try {
			this.log.debug('standby')
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'change_mode',
						mode: mode,
						device_id: device.id,
						timestamp: new Date().toISOString()
					})
				)
				.catch(err => {
					this.log.error('Error setting standby \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	openConnection(token, device) {
		try {
			this.log.debug('Opening WebSocket Connection')
			this.wsp
				.connect(token, device)
				//.then(ws =>
				//	ws.send({
				//		event: 'app_connection',
				//		orbit_session_token: token
				//	})
				//)
				.catch(err => {
					this.log.error('Error opening connection \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	onMessage(token, device, listener) {
		try {
			this.log.debug('Adding Event Listener for %s', device.name)
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.addEventListener('message', msg => {
						listener(msg.data, device.id)
					})
				)
				.catch(err => {
					this.log.error('Error configuring listener \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	sync(token, device) {
		try {
			this.log.debug('Syncing device %s info', device.name)
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'sync',
						device_id: device.id
					})
				)
				.catch(err => {
					this.log.error('Error syncing data \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}

	identify(token, device) {
		try {
			this.log.debug('Identify device %s info', device.name)
			this.wsp
				.connect(token, device)
				.then(ws =>
					ws.send({
						event: 'fs_identify',
						device_id: device.id,
						identify_time_ms: 5000
					})
				)
				.catch(err => {
					this.log.error('Error identify data \n%s', err)
				})
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}
}
module.exports = OrbitAPI

class WebSocketProxy {
	constructor(platform, log) {
		this.rws = null
		this.ping = null
		this.log = log
		this.platform = platform
	}

	async connect(token, device) {
		try {
			if (this.rws) {
				this.log.debug('ready state', this.rws.readyState)
				switch (this.rws.readyState) {
					case ws.CONNECTING:
						return this.rws
					case ws.OPEN:
						return this.rws
					case ws.CLOSING:
						this.rws.reconnect()
						return this.rws
					case ws.CLOSED:
						this.rws.reconnect()
						return this.rws
				}
			}
			return new Promise((resolve, reject) => {
				try {
					let options = {
						WebSocket: ws,
						maxReconnectionDelay: 10000, //64000
						minReconnectionDelay: Math.floor(1000 + Math.random() * 4000),
						reconnectionDelayGrowFactor: 1.3,
						minUptime: 5000,
						connectionTimeout: 4000, //10000
						maxRetries: Infinity,
						maxEnqueuedMessages: 1, //Infinity
						startClosed: false,
						debug: false
					}
					this.rws = new reconnectingwebsocket(WS_endpoint, [], options)
					// Intercept send events for logging
					let origSend = this.rws.send.bind(this.rws)
					this.rws.send = (data, options, callback) => {
						if (typeof data === 'object') {
							data = JSON.stringify(data, null, 2)
						}
						if (this.platform.showOutgoingMessages) {
							//this.log.debug(JSON.parse(data).event)
							if (JSON.parse(data).event != 'ping') {
								this.log.debug('sending outgoing message %s', data)
							}
						}
						origSend(data, options, callback)
					}
					// Ping
					this.ping = setInterval(() => {
						this.rws.send({event: 'ping'})
					}, Math.floor(Math.random() * (maxPingInterval - minPingInterval)) + minPingInterval)

					this.rws.onopen = event => {
						try {
							this.rws.send({
								event: 'app_connection',
								orbit_session_token: token,
							})
							this.log.debug(
								'connection open',
								JSON.stringify(
									{
										type: event.type
									},
									null,
									2
								)
							)
							this.log.info('WebSocket opened')
							resolve(this.rws)
						} catch {
							this.log.error('Error with open event \n%s', err)
						}
					}

					this.rws.onclose = event => {
						try {
							this.log.debug(
								'connection closed',
								JSON.stringify(
									{
										type: event.type,
										wasClean: event.wasClean,
										code: event.code,
										reason: event.reason
									},
									null,
									2
								)
							)
							if (event.code == 1000 || event.code == 1005 || event.code == 1006) {
								this.log.info('WebSocket closed')
								this.log.warn('Devices will not sync until WebSocket connection is restored.')
							}
						} catch {
							this.log.error('Error with close event \n%s', err)
						}
					}

					this.rws.onmessage = msg => {
						try {
							if (this.platform.showIncomingMessages) {
								this.log.debug('incoming message', JSON.parse(msg.data))
							}
						} catch {
							this.log.error('Error with ,essage event \n%s', err)
						}
					}

					this.rws.onerror = event => {
						try {
							this.log.debug('ready state', this.rws.readyState)
							this.log.debug('connection error', event.error)
							switch (this.rws.readyState) {
								case ws.CONNECTING:
									this.log.debug('WebSocket connecting')
									break
								case ws.OPEN:
									this.log.debug('WebSocket opened')
									break
								case ws.CLOSING:
									this.log.debug('WebSocket closing')
									break
								case ws.CLOSED:
									this.log.debug('WebSocket closed')
									break
							}
							reject(event)
						} catch {
							this.log.error('Error with error event \n%s', err)
						}
					}
				} catch (error) {
					this.log.error('caught', error.message)
					if (this.rws) {
						//check if connected
						this.log.warn('error, closing connection')
						this.rws.close((code = 1000), (reason = 'Session terminated by client'))
						//this.rws.close()
						try {
							this.rws.removeEventListener('open')
							this.rws.removeEventListener('close')
							this.rws.removeEventListener('message')
							this.rws.removeEventListener('error')
							clearInterval(this.ping)
							this.rws = null
						} catch (err) {
							this.log.error('Error closing connection \n%s', err)
						}
					}
				}
			})
		} catch (err) {
			this.log.error('Opps', err)
		}
	}
}