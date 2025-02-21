//Pulbic site https://techsupport.orbitbhyve.com
'use strict'

let axios = require('axios')
let reconnectingwebsocket = require('reconnecting-websocket')
let ws
let endpoint = 'https://api.orbitbhyve.com/v1'
let WS_endpoint = 'wss://api.orbitbhyve.com/v1/events'
let keepAlive

let maxPingInterval = 30000 // Websocket times out after 30s, will set a random value between 20 and 30
let minPingInterval = 20000

class OrbitAPI {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
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

	startZone(device, station, runTime) {
		try {
			this.log.debug('startZone', device.id, station, runTime)
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
		} catch (err) {
			this.log.error('Error starting zone \n%s', err)
		}
	}

	startSchedule(device, program) {
		try {
			this.log.debug('startZone', device.id, program)
			ws.send({
				event: 'change_mode',
				mode: 'manual',
				device_id: device.id,
				program: program
			})
		} catch (err) {
			this.log.error('Error starting zone \n%s', err)
		}
	}

	stopZone(device) {
		try {
			this.log.debug('stopZone')
			ws.send({
				event: 'change_mode',
				mode: 'manual',
				device_id: device.id,
				timestamp: new Date().toISOString()
			})
		} catch (err) {
			this.log.error('Error starting zone \n%s', err)
		}
	}

	startMultipleZone(device, runTime) {
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
			ws.send({
				event: 'change_mode',
				mode: 'manual',
				device_id: device.id,
				stations: body
			})
		} catch (err) {
			this.log.error('Error starting multiple zone \n%s', err)
		}
	}

	stopDevice(device) {
		try {
			this.log.debug('stopZone')
			ws.send({
				event: 'change_mode',
				mode: 'manual',
				device_id: device.id,
				//stations: [],
				timestamp: new Date().toISOString()
			})
		} catch (err) {
			this.log.error('Error stopping device \n%s', err)
		}
	}

	deviceStandby(device, mode) {
		try {
			this.log.debug('standby')
			ws.send({
				event: 'change_mode',
				mode: mode,
				device_id: device.id,
				timestamp: new Date().toISOString()
			})
		} catch (err) {
			this.log.error('Error setting standby \n%s', err)
		}
	}

	sync(device) {
		try {
			this.log.debug('Syncing device %s info', device.name)
			ws.send({
				event: 'sync',
				device_id: device.id
			})
		} catch (err) {
			this.log.error('Error syncing data \n%s', err)
		}
	}

	identify(device) {
		try {
			this.log.debug('Identify device %s info', device.name)
			ws.send({
				event: 'fs_identify',
				device_id: device.id,
				identify_time_ms: 5000
			})
		} catch (err) {
			this.log.error('Error identify data \n%s', err)
		}
	}

	openConnection(token, device, listener) {
		try {
			//ws = new WebSocket(WS_endpoint)
			//let clientSend = ws.send.bind(ws)

			let options = {
				WebSocket: WebSocket,
				maxReconnectionDelay: 10000,
				minReconnectionDelay: Math.floor(1000 + Math.random() * 4000),
				reconnectionDelayGrowFactor: 1.3,
				minUptime: 5000,
				connectionTimeout: 4000,
				maxRetries: Infinity,
				maxEnqueuedMessages: 1, //Infinity
				startClosed: false,
				debug: false
			}
			ws = new reconnectingwebsocket(WS_endpoint, [], options)
			let clientSend = ws.send.bind(ws)

			//capture data to send
			ws.send = (data, callback) => {
				switch (ws.readyState) {
					case ws.CONNECTING:
						setTimeout(() => {
							ws.send(data)
						}, 2000)
						break
					case ws.OPEN:
						if (typeof data === 'object') {
							data = JSON.stringify(data, null, 2)
						}
						if (this.platform.showOutgoingMessages) {
							//this.log.debug(JSON.parse(data).event)
							if (JSON.parse(data).event != 'ping') {
								this.log.debug('sending outgoing message %s', data)
							}
						}
						clientSend(data, callback)
						break
					case ws.CLOSING:
						this.log.warn('connection is closing')
						break
					case ws.CLOSED:
						this.log.warn('connection is closed')
						break
				}
			}

			ws.onopen = event => {
				try {
					ws.send({
						name: device.name,
						id: device.id,
						event: 'app_connection',
						orbit_session_token: token
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
					keepAlive = setInterval(() => {
						switch (ws.readyState) {
							case ws.CONNECTING:
								this.log.debug('readyState connecting')
								break
							case ws.OPEN:
								//this.log.debug('readyState open')
								ws.send({event: 'ping'})
								break
							case ws.CLOSING:
								this.log.debug('readyState closing')
								break
							case ws.CLOSED:
								this.log.debug('readyState closed')
								break
						}
					}, Math.floor(Math.random() * (maxPingInterval - minPingInterval)) + minPingInterval)
					this.log.info('WebSocket connection opened')
					this.platform.accessoryDeviceList.forEach(device => {
						let msg = {
							source: 'local',
							event: 'device_connected',
							device_id: device,
							timestamp: new Date().toISOString()
						}
						listener(JSON.stringify(msg), device)
					})
				} catch (err) {
					this.log.error('Error with open event \n%s', err)
				}
			}

			ws.onclose = event => {
				try {
					//event.target = 'ReconnectingWebSocket'
					if (event.wasClean == false) {
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
					}
					clearInterval(keepAlive)
					if (ws.readyState == 3) {
						this.log.info('WebSocket connection closed')
						this.platform.accessoryDeviceList.forEach(device => {
							let msg = {
								source: 'local',
								event: 'device_disconnected',
								device_id: device,
								timestamp: new Date().toISOString()
							}
							listener(JSON.stringify(msg), device)
						})
					}
				} catch (err) {
					this.log.error('Error with open event \n%s', err)
				}
			}

			ws.onmessage = msg => {
				try {
					if (this.platform.showIncomingMessages) {
						this.log.debug('incoming %s %s', msg.type, JSON.parse(msg.data))
						listener(msg.data, msg.device_id)
					}
				} catch (err) {
					this.log.error('Error with message event \n%s', err)
				}
			}

			ws.onerror = event => {
				try {
					if (ws.readyState != 2) {
						this.log.error('error', event.type)
						this.log.debug(
							'connection error',
							JSON.stringify(
								{
									type: event.type
								},
								null,
								2
							)
						)
					}
				} catch (err) {
					this.log.error('Error event \n%s', err)
				}
			}
		} catch (err) {
			this.log.error('something went wrong \n%s', err)
		}
	}
}
module.exports = OrbitAPI
