'use strict'
let OrbitAPI = require('./orbitapi')

class Orbit {
	constructor(platform, log, config) {
		this.orbitapi = new OrbitAPI(this, log)
		this.log = log
		this.config = config
		this.platform = platform
	}

	async updateService(message) {
		//process incoming messages
		try {
			let jsonBody = JSON.parse(message)
			if (jsonBody.source == 'local') this.log.debug('simulated message')
			let deviceName = this.deviceGraph.devices.filter(result => result.id == jsonBody.device_id)[0].name
			let deviceModel = this.deviceGraph.devices.filter(result => result.id == jsonBody.device_id)[0].hardware_version
			let eventType = this.deviceGraph.devices.filter(result => result.id == jsonBody.device_id)[0].type
			let activeService
			let uuid = UUIDGen.generate(jsonBody.device_id)
			/*****************************
				 			Possible states
					Active	InUse	  HomeKit Shows
					False	  False	  Off
					True    False	  Waiting
					True	  True	  Running
					False	  True	  Stopping
			******************************/
			if (this.showExtraDebugMessages) {
				this.log.debug('extra message', jsonBody)
			} //additional debug info before suppressing duplicates
			this.lastMessage.timestamp = jsonBody.timestamp //ignore message with no timestamp deltas, ignoring mode changes
			this.secondLastMessage.timestamp = jsonBody.timestamp //ignore message with no timestamp deltas, ignoring mode changes
			if (JSON.stringify(this.lastMessage) == JSON.stringify(jsonBody) || JSON.stringify(this.secondLastMessage) == JSON.stringify(jsonBody)) {
				return
			} //suppress duplicate websocket messages and checks sequence
			if (this.showExtraDebugMessages) {
				this.log.info('extra message', jsonBody)
			} //additional debug info after suppressing duplicates
			if (jsonBody.event != 'battery_status')
				//ignore event that is not logged
				this.secondLastMessage = this.lastMessage
			this.lastMessage = jsonBody
			switch (eventType) {
				case 'sprinkler_timer':
					let irrigationAccessory
					let irrigationSystemService
					let valveAccessory
					let percent
					if (this.showIrrigation) {
						//**Valve**//
						if (this.showSimpleValve && deviceModel.includes('HT25')) {
							valveAccessory = this.accessories[uuid]
							if (!valveAccessory) {
								return
							}
							let batteryService = valveAccessory.getService(Service.Battery)
							let switchServiceStandby = valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Standby'))
							let switchServiceRunall = valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Run All'))
							switch (jsonBody.event) {
								case 'watering_in_progress_notification':
									activeService = valveAccessory.getService(Service.Valve)
									if (activeService) {
										//stop last if program is running
										if (jsonBody.program != 'manual') {
											if (!this.activeProgram) {
												if (this.showSchedules) {
													let switchServiceSchedule = valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + jsonBody.program))
													this.log.info('Running Program %s, %s', jsonBody.program, switchServiceSchedule.getCharacteristic(Characteristic.Name).value)
												} else {
													this.log.info('Running Program %s', jsonBody.program)
												}
											}
											if (this.activeZone[jsonBody.device_id]) {
												activeService = valveAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
												activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
												activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
												this.activeZone[jsonBody.device_id] = false
												if (jsonBody.source != 'local') {
													if (this.activeProgram) {
														this.log.info('Device %s, Faucet %s scheduled watering', deviceName, activeService.getCharacteristic(Characteristic.Name).value)
													}
												}
											}
											this.activeProgram = jsonBody.program
										}
										//start active zone
										if (jsonBody.source != 'local') {
											this.activeZone[jsonBody.device_id] = jsonBody.current_station
											this.log.info('Device %s faucet, %s watering in progress for %s mins', deviceName, activeService.getCharacteristic(Characteristic.Name).value, Math.round(jsonBody.run_time))
										}
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
										activeService.getCharacteristic(Characteristic.SetDuration).updateValue(jsonBody.total_run_time_sec)
										activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(parseInt(jsonBody.run_time * 60))
										this.endTime[activeService.subtype] = new Date(Date.now() + parseInt(jsonBody.run_time * 60 * 1000)).toISOString()
									}
									break
								case 'watering_complete':
									activeService = valveAccessory.getService(Service.Valve)
									if (activeService) {
										if (jsonBody.source != 'local') {
											this.log.info('Device %s faucet, %s watering completed', deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											this.activeZone[jsonBody.device_id] = false
										}
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									}
									break
								case 'device_idle':
									activeService = valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + this.activeProgram))
									if (this.showRunall && switchServiceRunall) {
										switchServiceRunall.getCharacteristic(Characteristic.On).updateValue(false)
										this.log.info('Device is idle')
									}
									if (activeService) {
										//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										this.log.info('Program %s completed', activeService.getCharacteristic(Characteristic.Name).value)
										activeService.getCharacteristic(Characteristic.On).updateValue(false)
										this.activeProgram = false
									} else {
										if (this.activeProgram) {
											this.log.info('Program %s completed', this.activeProgram)
											this.activeProgram = false
										}
									}
									activeService = valveAccessory.getService(Service.Valve)
									if (activeService) {
										//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										this.log.info('Device %s idle', deviceName)
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									}
									break
								case 'change_mode':
									this.log.debug('%s mode changed to %s', deviceName, jsonBody.mode)
									switch (jsonBody.mode) {
										case 'auto':
											if (this.showStandby && switchServiceStandby) {
												switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)
											}
											break
										case 'manual':
											if (this.showStandby && switchServiceStandby) {
												switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)
											}
											break
										case 'off':
											if (this.showStandby && switchServiceStandby) {
												switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(true)
											}
											break
									}
									break
								case 'device_connected':
									this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString())
									valveAccessory.services.forEach(service => {
										if (Service.AccessoryInformation.UUID != service.UUID) {
											if (Service.Battery.UUID != service.UUID) {
												service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
											}
										}
									})
									break
								case 'device_disconnected':
									this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, jsonBody.timestamp)
									valveAccessory.services.forEach(service => {
										if (Service.AccessoryInformation.UUID != service.UUID) {
											if (Service.Battery.UUID != service.UUID) {
												service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
											}
										}
									})
									break
								case 'battery_status':
									percent = 0
									if (jsonBody.percent) {
										percent = jsonBody.percent
									} else if (jsonBody.mv) {
										percent = ((jsonBody.mv-2000) / (3400-2000)) * 100 > 100 ? 100 : ((jsonBody.mv-2000) /(3400-2000)) * 100
									}
									if (jsonBody.charging == undefined) {
										jsonBody.charging = false
									}
									this.log.debug('update battery status %s to %s%, charging=%s', deviceName, percent, jsonBody.charging)
									batteryService.getCharacteristic(Characteristic.ChargingState).updateValue(jsonBody.charging)
									batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(percent)
									break
								case 'low_battery':
									this.log.warn('%s battery low', deviceName)
									activeService = valveAccessory.getServiceById(Service.Battery, jsonBody.device_id)
									if (activeService) {
										activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
										//activeService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
									}
									break
								case 'clear_low_battery':
									this.log.debug('%s battery good', deviceName)
									activeService = valveAccessory.getServiceById(Service.Battery, jsonBody.device_id)
									if (activeService) {
										activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
										//activeService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
									}
									break
								case 'device_status':
									if (this.showExtraDebugMessages) {
										this.log.debug('%s updated at %s', deviceName, new Date(jsonBody.timestamp).toString())
									}
									break
								case 'program_changed':
									this.log.debug('%s program %s %s changed', deviceName, jsonBody.program.program, jsonBody.program.name)
									break
								case 'rain_delay':
									this.log.debug('%s rain delay %s hours for %s', deviceName, jsonBody.delay, jsonBody.rain_delay_weather_type)
									if(jsonBody.delay > 0){
										//device is idle
										activeService = valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + this.activeProgram))
										if (this.showRunall && switchServiceRunall) {
											switchServiceRunall.getCharacteristic(Characteristic.On).updateValue(false)
											this.log.info('Device is idle')
										}
										if (activeService) {
											//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											this.log.info('Program %s completed', activeService.getCharacteristic(Characteristic.Name).value)
											activeService.getCharacteristic(Characteristic.On).updateValue(false)
											this.activeProgram = false
										} else {
											if (this.activeProgram) {
												this.log.info('Program %s completed', this.activeProgram)
												this.activeProgram = false
											}
										}
										activeService = valveAccessory.getService(Service.Valve)
										if (activeService) {
											//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											this.log.info('Device %s idle', deviceName)
											activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
											activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
										}
									}
									break
								case 'firmware_update_progress':
									//do nothing
									let progress = jsonBody.offset / jsonBody.size
									this.log.info('Firmware update in progress for %s to version %s - %s% ', deviceName, jsonBody.version, progress)
									break
								case 'fault':
									this.log.debug('Message received: %s for device id %s stations %s', jsonBody.event, jsonBody.device_id, jsonBody.stations)
									break
								default:
									this.log.warn('%s Unknown faucet device message received: %s', deviceName, jsonBody.event)
									break
							}
						} else {
							//irrigation system
							irrigationAccessory = this.accessories[uuid]
							irrigationSystemService = irrigationAccessory.getService(Service.IrrigationSystem)
							if (!irrigationAccessory) {
								return
							}
							let batteryService = irrigationAccessory.getService(Service.Battery)
							let switchServiceStandby = irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Standby'))
							let switchServiceRunall = irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Run All'))
							switch (jsonBody.event) {
								case 'watering_in_progress_notification':
									irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
									activeService = irrigationAccessory.getServiceById(Service.Valve, jsonBody.current_station)
									if (activeService) {
										//stop last if program is running
										if (jsonBody.program != 'manual') {
											if (!this.activeProgram) {
												if (this.showSchedules) {
													let switchServiceSchedule = irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + jsonBody.program))
													this.log.info('Program %s, %s started', jsonBody.program, switchServiceSchedule.getCharacteristic(Characteristic.Name).value)
												} else {
													this.log.info('Program %s started', jsonBody.program)
												}
											}
											if (this.activeZone[jsonBody.device_id]) {
												activeService = irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
												activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
												activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
												this.activeZone[jsonBody.device_id] = false
												if (jsonBody.source != 'local') {
													if (this.activeProgram) {
														this.log.info('Device %s, Zone %s watering completed, starting next Zone', deviceName, activeService.getCharacteristic(Characteristic.Name).value)
													}
												}
											}
											this.activeProgram = jsonBody.program
										}
										//start active zone
										if (jsonBody.source != 'local') {
											this.activeZone[jsonBody.device_id] = jsonBody.current_station
											if (this.activeProgram) {
												this.log.info('Device %s, Zone %s watering in progress for %s mins', deviceName, activeService.getCharacteristic(Characteristic.Name).value, Math.round(jsonBody.run_time))
											}
										}
										if (!jsonBody.total_run_time_sec) {
											//added for older firmware that may not have this field populated
											jsonBody.total_run_time_sec = jsonBody.run_time * 60
										}
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
										activeService.getCharacteristic(Characteristic.SetDuration).updateValue(jsonBody.total_run_time_sec)
										activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(parseInt(jsonBody.run_time * 60))
										this.endTime[activeService.subtype] = new Date(Date.now() + parseInt(jsonBody.run_time * 60 * 1000)).toISOString()
									}
									//update other zones in quque with status
									if (jsonBody.water_event_queue) {
										if (jsonBody.water_event_queue.length > 0) {
											let match
											let deviceResponse = await this.orbitapi.getDevice(this.token, jsonBody.device_id).catch(err => {
												this.log.error('Failed to get device response %s', err)
											})
											for (let n = 0; n < deviceResponse.zones.length; n++) {
												match = false
												deviceResponse.zones[n].enabled = true // need orbit version of enabled
												if (deviceResponse.zones[n]) {
													for (let i = 0; i < jsonBody.water_event_queue.length; i++) {
														if (deviceResponse.zones[n].station == jsonBody.current_station && jsonBody.current_station == jsonBody.water_event_queue[i].station) {
															this.log.debug('%s program %s for zone-%s %s running', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name)
															//zone already running
															/*
															activeService=irrigationAccessory.getServiceById(Service.Valve, deviceResponse.zones[n].station)
															activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
															activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
															activeService.getCharacteristic(Characteristic.SetDuration).updateValue(jsonBody.total_run_time_sec)
															activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(parseInt(jsonBody.run_time * 60))
															this.endTime[activeService.subtype]= new Date(Date.now() + parseInt(jsonBody.run_time * 60 * 1000)).toISOString()
															*/
															match = true
															break
														} else if (deviceResponse.zones[n].station == jsonBody.water_event_queue[i].station) {
															this.log.debug('%s program %s for zone-%s %s waiting', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name)
															activeService = irrigationAccessory.getServiceById(Service.Valve, deviceResponse.zones[n].station)
															if (activeService) {
																activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
																activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
															}
															match = true
															break
														}
													}
													if (!match) {
														this.log.debug('%s program %s for zone-%s %s stopped', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name)
														activeService = irrigationAccessory.getServiceById(Service.Valve, deviceResponse.zones[n].station)
														if (activeService) {
															activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
															activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
														}
														continue
													}
												}
											}
										}
										//turn program switch off at last zone
										if (jsonBody.water_event_queue.length == 1) {
											activeService = irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + this.activeProgram))
											if (activeService) {
												//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
												this.log.info('Program %s finishing last zone', activeService.getCharacteristic(Characteristic.Name).value)
												setTimeout(() => {
													activeService.getCharacteristic(Characteristic.On).updateValue(false)
												}, jsonBody.water_event_queue[0].run_time_sec * 1000)
												//activeService.getCharacteristic(Characteristic.On).updateValue(false)
												this.activeProgram = false
											} else {
												if (this.activeProgram) {
													this.log.info('Program %s finished', this.activeProgram)
													this.activeProgram = false
												}
											}
										}
									}
									break
								case 'watering_complete':
									irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									activeService = irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
									if (activeService) {
										if (jsonBody.source != 'local') {
											this.log.info('Device %s, Zone %s watering completed', deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											this.activeZone[jsonBody.device_id] = false
										}
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									}
									break
								case 'device_idle':
									irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									activeService = irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + this.activeProgram))
									if (this.showRunall && switchServiceRunall) {
										switchServiceRunall.getCharacteristic(Characteristic.On).updateValue(false)
										this.log.info('Device is idle')
									}
									if (activeService) {
										//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										this.log.info('Program %s completed', activeService.getCharacteristic(Characteristic.Name).value)
										activeService.getCharacteristic(Characteristic.On).updateValue(false)
										this.activeProgram = false
									} else {
										if (this.activeProgram) {
											this.log.info('Program %s completed', this.activeProgram)
											this.activeProgram = false
										}
									}
									activeService = irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
									if (activeService) {
										//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										this.log.info('Device %s idle', deviceName)
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									}
									break
								case 'change_mode':
									this.log.debug('%s mode changed to %s', deviceName, jsonBody.mode)
									//this.log.info(activeService.getCharacteristic(Characteristic.Name))
									switch (jsonBody.mode) {
										case 'auto':
											irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED)
											if (this.showStandby && switchServiceStandby) {
												switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)
											}
											break
										case 'manual':
											irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE)
											if (this.showStandby && switchServiceStandby) {
												switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)
											}
											break
										case 'off':
											irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
											if (this.showStandby && switchServiceStandby) {
												switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(true)
											}
											break
									}
									break
								case 'device_connected':
									this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString())
									irrigationAccessory.services.forEach(service => {
										if (Service.AccessoryInformation.UUID != service.UUID) {
											if (Service.Battery.UUID != service.UUID) {
												service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
											}
										}
										if (Service.Valve.UUID == service.UUID) {
											service.getCharacteristic(Characteristic.Active).value
										}
										if (Service.Switch.UUID == service.UUID) {
											service.getCharacteristic(Characteristic.On).value
										}
									})
									break
								case 'device_disconnected':
									this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, jsonBody.timestamp)
									irrigationAccessory.services.forEach(service => {
										if (Service.AccessoryInformation.UUID != service.UUID) {
											if (Service.Battery.UUID != service.UUID) {
												service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
											}
										}
										if (Service.Valve.UUID == service.UUID) {
											service.getCharacteristic(Characteristic.Active).value
										}
										if (Service.Switch.UUID == service.UUID) {
											service.getCharacteristic(Characteristic.On).value
										}
									})
									break
								case 'battery_status':
									percent = 0
									if (jsonBody.percent) {
										percent = jsonBody.percent
									} else if (jsonBody.mv) {
										percent = ((jsonBody.mv-2000) / (3400-2000)) * 100 > 100 ? 100 : ((jsonBody.mv-2000) /(3400-2000)) * 100
									}
									if (jsonBody.charging == undefined) {
										jsonBody.charging = false
									}
									this.log.debug('update battery status %s to %s%, charging=%s', deviceName, percent, jsonBody.charging)
									batteryService.getCharacteristic(Characteristic.ChargingState).updateValue(jsonBody.charging)
									batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(percent)
									break
								case 'low_battery':
									this.log.warn('%s battery low', deviceName)
									activeService = irrigationAccessory.getServiceById(Service.Battery, jsonBody.device_id)
									if (activeService) {
										activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
										//activeService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
									}
									break
								case 'clear_low_battery':
									this.log.debug('%s battery good', deviceName)
									activeService = irrigationAccessory.getServiceById(Service.Battery, jsonBody.device_id)
									if (activeService) {
										activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
										//activeService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
									}
									break
								case 'device_status':
									if (this.showExtraDebugMessages) {
										this.log.debug('%s updated at %s', deviceName, new Date(jsonBody.timestamp).toString())
									}
									break
								case 'program_changed':
									this.log.debug('%s program %s %s changed', deviceName, jsonBody.program.program, jsonBody.program.name)
									break
								case 'rain_delay':
									this.log.debug('%s rain delay %s hours for %s', deviceName, jsonBody.delay, jsonBody.rain_delay_weather_type)
									if(jsonBody.delay > 0){
										//device is idle
										irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
										activeService = irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + this.activeProgram))
										if (this.showRunall && switchServiceRunall) {
											switchServiceRunall.getCharacteristic(Characteristic.On).updateValue(false)
											this.log.info('Device is idle')
										}
										if (activeService) {
											//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											this.log.info('Program %s completed', activeService.getCharacteristic(Characteristic.Name).value)
											activeService.getCharacteristic(Characteristic.On).updateValue(false)
											this.activeProgram = false
										} else {
											if (this.activeProgram) {
												this.log.info('Program %s completed', this.activeProgram)
												this.activeProgram = false
											}
										}
										activeService = irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
										if (activeService) {
											//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											this.log.info('Device %s idle', deviceName)
											activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
											activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
										}
									}
									break
								case 'firmware_update_progress':
									//do nothing
									let progress = jsonBody.offset / jsonBody.size
									this.log.info('Firmware update in progress for %s to version %s - %s% ', deviceName, jsonBody.version, progress)
									break
								case 'fault':
									this.log.debug('Message received: %s for device id %s stations %s', jsonBody.event, jsonBody.device_id, jsonBody.stations)
									break
								default:
									this.log.warn('%s Unknown sprinkler device message received: %s', deviceName, jsonBody.event)
									break
							}
						}
					}
					break
				case 'bridge':
					let bridgeAccessory
					if (this.showBridge) {
						bridgeAccessory = this.accessories[uuid]
						if (!bridgeAccessory) {
							return
						}
						activeService = bridgeAccessory.getServiceById(Service.WiFiTransport, jsonBody.device_id)
					}
					switch (jsonBody.event) {
						case 'device_connected':
							this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString())
							if (this.showBridge) {
								activeService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
							}
							break
						case 'device_disconnected':
							this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, new Date(jsonBody.timestamp).toString())
							if (this.showBridge) {
								activeService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
							}
							break
						case 'device_idle':
							//do nothing
							break
						case 'change_mode':
							//do nothing
							break
						case 'fault':
							//do nothing
							this.log.debug('Message received: %s for bridge device id %s', jsonBody.event, jsonBody.device_id)
							break
						case 'firmware_update_progress':
							//do nothing
							let progress = jsonBody.offset / jsonBody.size
							this.log.info('Firmware update in progress for %s to version %s - %s% ', deviceName, jsonBody.version, progress)
							break
						default:
							this.log.warn('%s Unknown bridge device message received: %s', deviceName, jsonBody.event)
							break
					}
					break
				case 'flood_sensor':
					let FSAccessory
					let leakService
					let tempService
					let batteryService
					let occupancySensor
					if (this.showFloodSensor || this.showTempSensor) {
						FSAccessory = this.accessories[uuid]
						if (!FSAccessory) {
							return
						}
						leakService = FSAccessory.getService(Service.LeakSensor)
						tempService = FSAccessory.getService(Service.TemperatureSensor)
						batteryService = FSAccessory.getService(Service.Battery)
						occupancySensor = FSAccessory.getService(Service.OccupancySensor)
						switch (jsonBody.event) {
							case 'battery_status':
								this.log.debug('update battery status %s %s to %s%', jsonBody.location_name, jsonBody.name, jsonBody.battery.percent)
								batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.battery.percent)
								if (jsonBody.battery.percent <= this.lowBattery) {
									batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
								} else {
									batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
								}
								//batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(Math.floor((Math.random() * 100) + 1)) //enable for testing
								break
							case 'fs_status_update':
								//this.log.info('%s status update at %s',deviceName,new Date(jsonBody.timestamp).toString())
								if (this.showFloodSensor) {
									switch (jsonBody.flood_alarm_status) {
										case 'ok':
											leakService.getCharacteristic(Characteristic.LeakDetected).updateValue(Characteristic.LeakDetected.LEAK_NOT_DETECTED)
											break
										case 'alarm':
											leakService.getCharacteristic(Characteristic.LeakDetected).updateValue(Characteristic.LeakDetected.LEAK_DETECTED)
											break
										default:
											leakService.getCharacteristic(Characteristic.LeakDetected).updateValue(Characteristic.LeakDetected.LEAK_NOT_DETECTED)
											break
									}
								}
								if (this.showTempSensor) {
									tempService.getCharacteristic(Characteristic.CurrentTemperature).updateValue(((jsonBody.temp_f - 32) * 5) / 9)
								}
								if (this.showLimitsSensor) {
									switch (jsonBody.temp_alarm_status) {
										case 'ok':
											occupancySensor.getCharacteristic(Characteristic.OccupancyDetected).updateValue(Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
											break
										case 'low_temp_alarm':
											occupancySensor.getCharacteristic(Characteristic.OccupancyDetected).updateValue(Characteristic.OccupancyDetected.OCCUPANCY_DETECTED)
											break
										case 'high_temp_alarm':
											occupancySensor.getCharacteristic(Characteristic.OccupancyDetected).updateValue(Characteristic.OccupancyDetected.OCCUPANCY_DETECTED)
											break
										default:
											occupancySensor.getCharacteristic(Characteristic.OccupancyDetected).updateValue(Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
											break
									}
								}
								break
							case 'device_connected':
								this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString())
								if (this.showFloodSensor) {
									leakService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
								}
								if (this.showTempSensor) {
									tempService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
								}
								if (this.showLimitsSensor) {
									occupancySensor.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
								}
								break
							case 'device_disconnected':
								this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, new Date(jsonBody.timestamp).toString())
								if (this.showFloodSensor) {
									leakService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
								}
								if (this.showTempSensor) {
									tempService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
								}
								if (this.showLimitsSensor) {
									occupancySensor.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
								}
								break
							case 'fault':
								//do nothing
								break
							default:
								this.log.warn('%s Unknown flood sensor device message received: %s', deviceName, jsonBody.event)
								break
						}
					}
					break
				default:
					this.log.warn('%s Unknown irrigation device message received: %s', deviceName, jsonBody.event)
					break
			}
			return
		} catch (err) {
			this.log.error('Error updating service %s', err)
		}
	}
}
module.exports = Orbit
