'use strict'
let OrbitAPI=require('./orbitapi')
let battery=require('./devices/battery')
let bridge=require('./devices/bridge')
let irrigation=require('./devices/irrigation')
let valve=require('./devices/valve')
let sensor=require('./devices/sensor')
let basicSwitch=require('./devices/switch')

class PlatformOrbit {
	constructor(log, config, api){
		this.orbitapi=new OrbitAPI(this,log)
		this.battery=new battery(this,log)
		this.bridge=new bridge(this,log)
		this.irrigation=new irrigation(this,log)
		this.valve=new valve(this,log)
		this.sensor=new sensor(this,log)
		this.basicSwitch=new basicSwitch(this,log)
		this.log=log
		this.config=config
		this.email=config.email
		this.password=config.password
		this.token
		this.retryWait=config.retryWait ? config.retryWait : 60 //sec
		this.retryMax=config.retryMax ? config.retryMax : 3 //attempts
		this.retryAttempt=0
		this.userId
		this.useIrrigationDisplay=config.useIrrigationDisplay
		this.showSimpleValve=config.showSimpleValve ? config.showSimpleValve : false
		this.displayValveType=config.displayValveType
		this.defaultRuntime=config.defaultRuntime*60
		this.runtimeSource=config.runtimeSource
		this.showStandby=config.showStandby
		this.showRunall=config.showRunall
		this.showSchedules=config.showSchedules
		this.locationAddress=config.locationAddress
		this.showIrrigation=config.showIrrigation
		this.showBridge=config.showBridge
		this.showFloodSensor=config.showFloodSensor
		this.showTempSensor=config.showTempSensor
		this.showLimitsSensor=config.showLimitsSensor
		this.showAPIMessages=config.showAPIMessages ? config.showAPIMessages : false
		this.showIncomingMessages=config.showIncomingMessages ? config.showIncomingMessages : false
		this.showOutgoingMessages=config.showOutgoingMessages ? config.showOutgoingMessages : false
		this.showExtraDebugMessages=config.showExtraDebugMessages ? config.showExtraDebugMessages : false
		this.lowBattery=config.lowBattery ? config.lowBattery : 20
		this.lastMessage={}
		this.endTime=[]
		this.activeZone=[]
		this.activeProgram
		this.meshNetwork
		this.meshId
		this.networkTopology
		this.networkTopologyId
		this.deviceGraph
		this.accessories=[]
		if(!config.email || !config.password){
			this.log.error('Valid email and password are required in order to communicate with the b-hyve, please check the plugin config')
		}
		this.log.info('Starting Orbit Platform using homebridge API', api.version)
		if(api){
			this.api=api
			this.api.on("didFinishLaunching", function (){
				// Get Orbit devices
				this.getDevices()
			}.bind(this))
		}
	}

	identify(){
		this.log.info('Identify the sprinkler!')
	}

	async getDevices(){
		try{
			let locationMatch
			this.log.debug('Fetching Build info...')
			this.log.info('Getting Account info...')
			// login to the API and get the token
			let signinResponse=(await this.orbitapi.getToken(this.email,this.password).catch(err=>{this.log.error('Failed to get token for build', err)}))
			this.log.info('Found account for',signinResponse.user_name)
			//this.log.debug('Found api key',signinResponse.orbit_api_key)
			this.log.debug('Found api key %s********************%s', signinResponse.orbit_api_key.substring(0,35),signinResponse.orbit_api_key.substring((signinResponse.orbit_api_key).length-35))
			this.token=signinResponse.orbit_api_key
			this.userId=signinResponse.user_id
			//get device graph
			this.deviceGraph=(await this.orbitapi.getDeviceGraph(this.token,this.userId).catch(err=>{this.log.error('Failed to get graph info %s', err)}))
			this.deviceGraph.devices=this.deviceGraph.devices.sort(function (a, b){ // read bridge info first
				return a.type > b.type ? 1
						:a.type < b.type ? -1
						:0
			})
			this.log.debug('Found device graph for user id %s, %s',this.userId,this.deviceGraph)
			this.deviceGraph.devices.filter((device)=>{
				if(device.address==undefined){
					device.address={
						"line_1":"undefined location",
						"line_2":"",
						"city":"",
						"state":"",
						"country":""
					}
					this.log.debug('No location address defined, adding dummy location %s',device.address)
				}
				if(!this.locationAddress || this.locationAddress==device.address.line_1){
					if(device.is_connected){
						this.log.info('Online device %s %s found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1)
						if(device.network_topology_id){
							this.networkTopologyId=device.network_topology_id
							this.networkTopology=(this.orbitapi.getNetworkTopologies(this.token,device.network_topology_id).catch(err=>{this.log.error('Failed to get network topology %s', err)}))
						}
						if(device.mesh_id){
							this.meshId=device.mesh_id
							this.meshNetwork=(this.orbitapi.getMeshes(this.token,device.mesh_id).catch(err=>{this.log.error('Failed to get network mesh %s', err)}))
						}
					}
					else{
						this.log.info('Offline device %s %s found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1)
						this.log.warn('%s is disconnected! This will show as non-responding in Homekit until the connection is restored.',device.name)
					}
					locationMatch=true
				}
				else if(device.address.line_1 =='undefined location' && (this.networkTopologyId==device.network_topology_id || this.meshId==device.mesh_id)){
					if(device.is_connected){
						this.log.info('Online device %s %s found for the location: %s',device.hardware_version,device.name,device.location_name)
					}
					else{
						this.log.info('Offline device %s %s found for the location: %s',device.hardware_version,device.name,device.location_name)
						this.log.warn('%s is disconnected! This will show as non-responding in Homekit until the connection is restored.',device.name)
					}
					locationMatch=true
				}
				else{
					this.log.info('Skipping device %s %s at %s, not found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1,this.locationAddress)
					locationMatch=false
				}
				return locationMatch
			}).forEach(async(device)=>{
				// adding devices that met filter criteria
				let newDevice=(await this.orbitapi.getDevice(this.token, device.id).catch(err=>{this.log.error('Failed to get devices for build %s', err)}))
				let uuid=UUIDGen.generate(newDevice.id)
				//remove cached accessories
				if(this.accessories[uuid]){
					this.log.debug('Removed cached device',device.id)
					this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
					delete this.accessories[uuid]
				}
				switch (newDevice.type){
					case "sprinkler_timer":
						let switchService
						if(!this.showIrrigation){
							this.log.info('Skipping Irrigation System %s %s based on config', newDevice.hardware_version, newDevice.name)
							return
						}
						this.log.debug('Adding Sprinkler Timer Device')
						if(newDevice.status.run_mode){
							this.log.debug('Found device %s with status %s',newDevice.name,newDevice.status.run_mode)
						}
						else{
							this.log.warn('Found device %s with an unknown status %s, please check connection status',newDevice.name) ////error maybe
						}
						//this.log.warn(newDevice.hardware_version)
						if(this.showSimpleValve && newDevice.hardware_version.includes('HT25')){
							this.log.debug('Creating and configuring new device')
							let valveAccessory
							let valveService

							// Create and configure Values Service
							newDevice.zones=newDevice.zones.sort(function (a, b){
								return a.station - b.station
							})
							newDevice.zones.forEach((zone)=>{
								zone.enabled=true // need orbit version of enabled
								if(!this.useIrrigationDisplay && !zone.enabled){
									this.log.info('Skipping disabled zone %s',zone.name )
								}
								else{
									// Create and configure valve Service
									this.log.debug('Creating and configuring %s',zone.name)
									valveAccessory=this.valve.createValveAccessory(newDevice,zone,uuid)
									valveService=valveAccessory.getService(Service.Valve)
									this.valve.updateValveService(newDevice,zone,valveService)
									this.valve.configureValveService(newDevice,zone,valveService)
									valveService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

									// Create and configure Battery Service if needed
									if(newDevice.battery!=null){
										this.log.info('Adding Battery status for %s', newDevice.name)
										let batteryStatus=this.battery.createBatteryService(newDevice)
										this.battery.configureBatteryService(batteryStatus)
										valveAccessory.getService(Service.Valve).addLinkedService(batteryStatus)
										valveAccessory.addService(batteryStatus)
									}
									else{
										this.log.debug('%s has no battery found, skipping add battery service', newDevice.name)
									}
								}
							})
							if(this.showSchedules){
								let scheduleResponse=(await this.orbitapi.getTimerPrograms(this.token,newDevice).catch(err=>{this.log.error('Failed to get schedule for device', err)}))
								scheduleResponse=scheduleResponse.sort(function (a, b){
									//return a.program - b.program
									return a.program > b.program ? 1
											:a.program < b.program ? -1
											:0
								})
								scheduleResponse.forEach((schedule)=>{
									if(schedule.enabled){
										this.log.debug('adding schedules %s program %s',schedule.name, schedule.program )
										switchService=this.basicSwitch.createScheduleSwitchService(newDevice, schedule)
										this.basicSwitch.configureSwitchService(newDevice, switchService)
										valveAccessory.getService(Service.Valve).addLinkedService(switchService)
										valveAccessory.addService(switchService)
									}
									else{
										this.log.warn('Skipping switch for disabled program %s', schedule.name)
									}
								})
							}
							/*
							if(this.showRunall){
								this.log.debug('adding new run all switch')
								switchService=this.basicSwitch.createSwitchService(newDevice,'Run All')
								this.basicSwitch.configureSwitchService(newDevice, switchService)
								valveAccessory.getService(Service.Valve).addLinkedService(switchService)
								valveAccessory.addService(switchService)
								}
							*/
							if(this.showStandby){
								this.log.debug('adding new standby switch')
								switchService=this.basicSwitch.createSwitchService(newDevice,'Standby')
								this.basicSwitch.configureSwitchService(newDevice, switchService)
								valveAccessory.getService(Service.Valve).addLinkedService(switchService)
								valveAccessory.addService(switchService)
							}
								// Register platform accessory
								this.log.debug('Registering platform accessory')
								this.accessories[uuid]=valveAccessory
								this.api.registerPlatformAccessories(PluginName, PlatformName, [valveAccessory])
							}
						else{ // **** Create and configure Irrigation Service ****
							this.log.debug('Creating and configuring new device')
							let irrigationAccessory=this.irrigation.createIrrigationAccessory(newDevice,uuid)
							let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
							this.irrigation.configureIrrigationService(newDevice,irrigationSystemService)
							// set current device status
							irrigationSystemService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

							// Create and configure Battery Service if needed
							if(newDevice.battery!=null){
								this.log.info('Adding Battery status for %s', newDevice.name)
								let batteryStatus=this.battery.createBatteryService(newDevice)
								this.battery.configureBatteryService(batteryStatus)
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(batteryStatus)
								irrigationAccessory.addService(batteryStatus)
							}
							else{
								this.log.debug('%s has no battery found, skipping add battery service', newDevice.name)
							}
							// Create and configure Values services and link to Irrigation Service
							newDevice.zones=newDevice.zones.sort(function (a, b){
								return a.station - b.station
							})
							newDevice.zones.forEach((zone)=>{
								zone.enabled=true // need orbit version of enabled
								if(!this.useIrrigationDisplay && !zone.enabled){
									this.log.info('Skipping disabled zone %s',zone.name )
								}
								else{
									this.log.debug('adding zone %s',zone.name )
									let valveService=this.irrigation.createValveService(zone, newDevice)
									this.irrigation.configureValveService(newDevice, valveService)
									if(this.useIrrigationDisplay){
										this.log.debug('Using Irrigation system')
										irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(valveService)
										irrigationAccessory.addService(valveService)
									}
									else{
										this.log.debug('Using separate tiles')
										irrigationAccessory.getService(Service.IrrigationSystem)
										irrigationAccessory.addService(valveService)
									}
								}
							})
							if(this.showSchedules){
								let scheduleResponse=(await this.orbitapi.getTimerPrograms(this.token,newDevice).catch(err=>{this.log.error('Failed to get schedule for device', err)}))
								scheduleResponse=scheduleResponse.sort(function (a, b){
									//return a.program - b.program
									return a.program > b.program ? 1
											:a.program < b.program ? -1
											:0
								})
								scheduleResponse.forEach((schedule)=>{
									if(schedule.enabled){
										this.log.debug('adding schedules %s program %s',schedule.name, schedule.program )
										switchService=this.basicSwitch.createScheduleSwitchService(newDevice, schedule)
										this.basicSwitch.configureSwitchService(newDevice, switchService)
										irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
										irrigationAccessory.addService(switchService)
									}
									else{
										this.log.warn('Skipping switch for disabled program %s', schedule.name)
									}
								})
							}
							if(this.showRunall){
								this.log.debug('adding new run all switch')
								switchService=this.basicSwitch.createSwitchService(newDevice,'Run All')
								this.basicSwitch.configureSwitchService(newDevice, switchService)
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
								irrigationAccessory.addService(switchService)
								}
							if(this.showStandby){
								this.log.debug('adding new standby switch')
								switchService=this.basicSwitch.createSwitchService(newDevice,'Standby')
								this.basicSwitch.configureSwitchService(newDevice, switchService)
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
								irrigationAccessory.addService(switchService)
							}

							// Register platform accessory
							this.log.debug('Registering platform accessory')
							this.accessories[uuid]=irrigationAccessory
							this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
						}
						break
					case "bridge":
						let bridgeAccessory
						let bridgeService
						if(!this.showBridge){
							this.log.info('Skipping Bridge %s %s based on config', newDevice.hardware_version, newDevice.name)
							return
						}
						this.log.debug('Adding Bridge Device')
						this.log.debug('Found device %s', newDevice.name)
						switch (newDevice.hardware_version){
							case "BH1-0001":
								// Create and configure Gen 1Bridge Service
								let meshNetwork=(await this.orbitapi.getMeshes(this.token,newDevice.mesh_id).catch(err=>{this.log.error('Failed to add G1 bridge %s', err)}))
								this.log.debug('Creating and configuring new bridge')
								bridgeAccessory=this.bridge.createBridgeAccessory(newDevice, uuid)
								bridgeService=bridgeAccessory.getService(Service.Tunnel)
								bridgeService=this.bridge.createBridgeService(newDevice,meshNetwork,false)
								this.bridge.configureBridgeService(bridgeService)

								// set current device status
								bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

								bridgeAccessory.addService(bridgeService)
								this.log.info('Adding Gen-1 Bridge')
								this.log.debug('Registering platform accessory')
								this.accessories[uuid]=bridgeAccessory
								this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
								break
							case "BH1G2-0001":
								// Create and configure Gen2 Bridge Service
								let networkTopology=(await this.orbitapi.getNetworkTopologies(this.token,newDevice.network_topology_id).catch(err=>{this.log.error('Failed to add G2 bridge %s', err)}))
								this.log.debug('Creating and configuring new bridge')
								bridgeAccessory=this.bridge.createBridgeAccessory(newDevice, uuid)
								bridgeService=bridgeAccessory.getService(Service.Tunnel)
								bridgeService=this.bridge.createBridgeService(newDevice,networkTopology,true)
								this.bridge.configureBridgeService(bridgeService)

								// set current device status
								bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

								bridgeAccessory.addService(bridgeService)
								this.log.info('Adding Gen-2 Bridge')
								this.log.debug('Registering platform accessory')
								this.accessories[uuid]=bridgeAccessory
								this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
								break
						}
						break
					case "flood_sensor":
						if(!this.showFloodSensor && !this.showTempSensor && !this.showLimitsSensor){
							this.log.info('Skipping Flood Sensor %s %s based on config', newDevice.hardware_version, newDevice.name)
							return
						}
						this.log.debug('Adding Flood Sensor Device')
						this.log.debug('Found device %s',newDevice.name)
						// Remove cached accessory
						this.log.debug('Removed cached device')
						let FSAccessory
						if(this.showFloodSensor || this.showTempSensor || this.showLimitsSensor){
							FSAccessory=this.sensor.createFloodAccessory(newDevice, uuid)
							this.log.info('Adding Battery status for %s %s',newDevice.location_name, newDevice.name)
							let batteryStatus=this.battery.createBatteryService(newDevice)
							this.battery.configureBatteryService(batteryStatus)
							FSAccessory.getService(Service.Battery)
							FSAccessory.addService(batteryStatus)
							this.log.debug('Registering platform accessory')
							this.accessories[uuid]=FSAccessory
							this.api.registerPlatformAccessories(PluginName, PlatformName, [FSAccessory])
							// Refresh battery status every so often for flood sensors
							setInterval(async()=>{
								try{
									let sensorResponse=(await this.orbitapi.getDevice(this.token, newDevice.id).catch(err=>{this.log.error('Failed to get device response %s', err)}))
									this.log.debug('check battery status %s %s',sensorResponse.location_name, sensorResponse.name)
									sensorResponse.device_id=sensorResponse.id
									sensorResponse.event='battery_status'
									this.updateService(JSON.stringify(sensorResponse))
								}catch(err){this.log.error('Failed to read each sensor', err)}
							}, 4*60*60*1000) //4 hours in ms
						}
						if(this.showFloodSensor){
							this.log.info('Adding Flood Sensor for %s %s',newDevice.location_name, newDevice.name)
							let leakSensor=this.sensor.createLeakService(newDevice)
							this.sensor.configureLeakService(leakSensor)
							FSAccessory.getService(Service.LeakSensor)
							FSAccessory.addService(leakSensor)
						}
						if(this.showTempSensor){
							this.log.info('Adding Temperature Sensor for %s %s',newDevice.location_name, newDevice.name)
							let tempSensor=this.sensor.createTempService(newDevice)
							this.sensor.configureTempService(tempSensor)
							FSAccessory.getService(Service.TemperatureSensor)
							FSAccessory.addService(tempSensor)
						}
						if(this.showLimitsSensor){
							let occupancySensor=this.sensor.createOccupancyService(newDevice)
							this.sensor.configureOccupancyService(occupancySensor)
							FSAccessory.getService(Service.OccupancySensor)
							FSAccessory.addService(occupancySensor)
						}
						break
					default:
					// do nothing
				}
				this.log.debug('Establish connection for %s',newDevice.name)
				this.orbitapi.openConnection(this.token, newDevice)
				this.orbitapi.onMessage(this.token, newDevice, this.updateService.bind(this))
				// Send Sync after 2 sec delay, match state to bhyve state
				setTimeout(()=>{this.orbitapi.sync(this.token, newDevice)}, 2000)
			})
			setTimeout(()=>{this.log.info('Orbit Platform finished loading')}, 500)
		}catch(err){
			if(this.retryAttempt<this.retryMax){
				this.retryAttempt++
				this.log.error('Failed to get devices. Retry attempt %s of %s in %s seconds...',this.retryAttempt, this.retryMax, this.retryWait*this.retryAttempt)
				this.log.error(err)
				setTimeout(async()=>{
					this.getDevices()
				},this.retryWait*this.retryAttempt*1000)
			}
			else{
				this.log.error('Failed to get devices...\n%s', err)
			}
		}
	}

	//**
	//** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
	//**
	configureAccessory(accessory){
		// Added cached devices to the accessories array
		this.log.debug('Found cached accessory %s', accessory.displayName)
		this.accessories[accessory.UUID]=accessory
	}

	async updateService(message){
		//process incoming messages
		try{
		let jsonBody=JSON.parse(message)
		let deviceName=this.deviceGraph.devices.filter(result=>result.id == jsonBody.device_id)[0].name
		let deviceModel=this.deviceGraph.devices.filter(result=>result.id == jsonBody.device_id)[0].hardware_version
		let eventType=this.deviceGraph.devices.filter(result=>result.id == jsonBody.device_id)[0].type
		let activeService
		let uuid=UUIDGen.generate(jsonBody.device_id)
		/*****************************
				 Possible states
		Active	InUse	  HomeKit Shows
		False	  False	  Off
		True    False	  Waiting
		True	  True	  Running
		False	  True	  Stopping
		******************************/
		if(this.showExtraDebugMessages){this.log.debug('extra message',jsonBody)} //additional debug info before suppressing duplicates
		this.lastMessage.timestamp=jsonBody.timestamp //ignore message with no timestamp deltas
		if(JSON.stringify(this.lastMessage)==JSON.stringify(jsonBody)){return} //suppress duplicate websocket messages
		if(this.showExtraDebugMessages){this.log.info('extra message',jsonBody)} //additional debug info after suppressing duplicates
		this.lastMessage=jsonBody
		switch (eventType){
			case "sprinkler_timer":
				let irrigationAccessory
				let irrigationSystemService
				let valveAccessory
				let percent
				if(this.showIrrigation){
					if(this.showSimpleValve && deviceModel.includes('HT25')){
						valveAccessory=this.accessories[uuid]
						if(!valveAccessory){return}
						let batteryService=valveAccessory.getService(Service.Battery)
						let switchServiceStandby=valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Standby'))
						let switchServiceRunall=valveAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Run All'))
						switch (jsonBody.event){
							case "watering_in_progress_notification":
								activeService=valveAccessory.getService(Service.Valve)
								if(activeService){
									//stop last if program is running
									if(jsonBody.program!= 'manual'){
										if(this.showSchedules){
											this.log.info('Running Program %s, %s',jsonBody.program, valveAccessory.getServiceById(Service.Switch, jsonBody.program).getCharacteristic(Characteristic.Name).value)
										}
										else{
											this.log.info('Running Program %s',jsonBody.program)
										}
										this.activeProgram=jsonBody.program
										if(this.activeZone[jsonBody.device_id]){
											if(jsonBody.source!='local'){
												this.log.info('Device %s faucet, %s watering completed',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											}
											activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
											activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
										}
									}
									//start new
									if(jsonBody.source!='local'){
										this.log.info('Device %s faucet, %s watering in progress for %s mins',deviceName, activeService.getCharacteristic(Characteristic.Name).value, Math.round(jsonBody.run_time))
										this.activeZone[jsonBody.device_id]=jsonBody.current_station
									}
									activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
									activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
									activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(jsonBody.run_time * 60)
									this.endTime[activeService.subtype]= new Date(Date.now() + parseInt(jsonBody.run_time) * 60 * 1000).toISOString()
								}
								break
							case "watering_complete":
								activeService=valveAccessory.getService(Service.Valve)
								if(activeService){
									if(jsonBody.source!='local'){
										this.log.info('Device %s faucet, %s watering completed',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										this.activeZone[jsonBody.device_id]=false
									}
									activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
									activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
								}
								break
							case "device_idle":
								activeService=valveAccessory.getServiceById(Service.Switch, this.activeProgram)
								if(this.showRunall && switchServiceRunall){
									switchServiceRunall.getCharacteristic(Characteristic.On).updateValue(false)
									this.log.info('Running all zones completed')
								}
								if(activeService){
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
									this.log.info('Program %s completed',activeService.getCharacteristic(Characteristic.Name).value)
									activeService.getCharacteristic(Characteristic.On).updateValue(false)
									this.activeProgram=false
								}
								else{
									if(this.activeProgram){
										this.log.info('Program %s completed',this.activeProgram)
										this.activeProgram=false
									}
								}
								activeService=valveAccessory.getService(Service.Valve)
								if(activeService){
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
									this.log.info('Device %s idle',deviceName)
									activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
									activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
								}
								break
							case "change_mode":
								this.log.debug('%s mode changed to %s',deviceName,jsonBody.mode)
								switch (jsonBody.mode){
									case "auto":
										if(this.showStandby && switchServiceStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)}
										break
									case "manual":
										if(this.showStandby && switchServiceStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)}
										break
									case "off":
										if(this.showStandby && switchServiceStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(true)}
										break
									}
								break
							case "device_connected":
								this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
								valveAccessory.services.forEach((service)=>{
									if(Service.AccessoryInformation.UUID != service.UUID){
										if(Service.Battery.UUID != service.UUID){
										service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
										}
									}
									if(Service.Valve.UUID == service.UUID){
										service.getCharacteristic(Characteristic.Active).getValue()
									}
									if(Service.Switch.UUID == service.UUID){
										service.getCharacteristic(Characteristic.On).getValue()
									}
								})
								break
							case "device_disconnected":
								this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',deviceName,jsonBody.timestamp)
								valveAccessory.services.forEach((service)=>{
									if(Service.AccessoryInformation.UUID != service.UUID){
										if(Service.Battery.UUID != service.UUID){
										service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
										}
									}
									if(Service.Valve.UUID == service.UUID){
										service.getCharacteristic(Characteristic.Active).getValue()
									}
									if(Service.Switch.UUID == service.UUID){
										service.getCharacteristic(Characteristic.On).getValue()
									}
								})
								break
							case "battery_status":
								percent=0
								if(jsonBody.mv){
									percent=jsonBody.mv/3000*100 > 100 ? 100 : jsonBody.mv/3000*100
								}
								else if(jsonBody.percent){
									percent=jsonBody.percent
								}
								if(jsonBody.charging==undefined){jsonBody.charging=false}
								this.log.debug('update battery status %s to %s%, charging=%s', deviceName, percent, jsonBody.charging)
								batteryService.getCharacteristic(Characteristic.ChargingState).updateValue(jsonBody.charging)
								batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(percent)
								break
							case "low_battery":
								this.log.warn('%s battery low',deviceName)
								activeService=valveAccessory.getServiceById(Service.Battery, jsonBody.device_id)
								if(activeService){
									activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
								}
								break
							case "device_status":
								if(this.showExtraDebugMessages){
									this.log.debug('%s updated at %s',deviceName,new Date(jsonBody.timestamp).toString())
								}
								break
							case "program_changed":
								this.log.info('%s program change',deviceName)
								break
							case "rain_delay":
								this.log.debug('%s rain delay',deviceName)
								break
							default:
								this.log.warn('Unknown faucut device message received: %s',jsonBody.event)
							break
						}
					}
					else{ //irrigation system
						irrigationAccessory=this.accessories[uuid]
						irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
						if(!irrigationAccessory){return}
						let batteryService=irrigationAccessory.getService(Service.Battery)
						let switchServiceStandby=irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Standby'))
						let switchServiceRunall=irrigationAccessory.getServiceById(Service.Switch, UUIDGen.generate(jsonBody.device_id + 'Run All'))
						switch (jsonBody.event){
							case "watering_in_progress_notification":
								irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
								activeService=irrigationAccessory.getServiceById(Service.Valve, jsonBody.current_station)
								if(activeService){
									//stop last if program is running
									if(jsonBody.program!= 'manual'){
										if(this.showSchedules){
											this.log.info('Running Program %s, %s',jsonBody.program, irrigationAccessory.getServiceById(Service.Switch, jsonBody.program).getCharacteristic(Characteristic.Name).value)
										}
										else{
											this.log.info('Running Program %s',jsonBody.program)
										}
										this.activeProgram=jsonBody.program
										if(this.activeZone[jsonBody.device_id]){
											activeService=irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
											if(jsonBody.source!='local'){
												this.log.info('Device %s, %s zone watering completed',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
											}
											activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
											activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
										}
									}
									//start new
									if(jsonBody.source!='local'){
										this.log.info('Device %s, %s zone watering in progress for %s mins',deviceName, activeService.getCharacteristic(Characteristic.Name).value, Math.round(jsonBody.run_time))
										this.activeZone[jsonBody.device_id]=jsonBody.current_station
									}
									activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
									activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
									activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(jsonBody.run_time * 60)
									this.endTime[activeService.subtype]= new Date(Date.now() + parseInt(jsonBody.run_time) * 60 * 1000).toISOString()
								}
								//update other zones in quque status
								if(jsonBody.water_event_queue){
									if(jsonBody.water_event_queue.length>0){
										let match
										let deviceResponse=(await this.orbitapi.getDevice(this.token, jsonBody.device_id).catch(err=>{this.log.error('Failed to get device response %s', err)}))
										for (let n = 0; n < deviceResponse.zones.length; n++) {
											match=false
											deviceResponse.zones[n].enabled = true // need orbit version of enabled
											if (deviceResponse.zones[n]) {
												for (let i = 0; i < jsonBody.water_event_queue.length; i++) {
													if(deviceResponse.zones[n].station==jsonBody.current_station && jsonBody.current_station==jsonBody.water_event_queue[i].station){
														this.log.debug('%s program %s for zone-%s %s running', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name)
														//skip updates for current zone, already set.
														match=true
														break
													}
													else if(deviceResponse.zones[n].station==jsonBody.water_event_queue[i].station){
														this.log.debug('%s program %s for zone-%s %s waiting', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name)
														activeService=irrigationAccessory.getServiceById(Service.Valve, deviceResponse.zones[n].station)
														if(activeService){
															activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
															activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
														}
														match=true
														break
													}
												}
												if(!match){
													this.log.debug('%s program %s for zone-%s %s stopped', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name)
													activeService=irrigationAccessory.getServiceById(Service.Valve, deviceResponse.zones[n].station)
													if(activeService){
														activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
														activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
													}
													continue
												}
											}
										}
									}
								}
								break
							case "watering_complete":
								irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
								activeService=irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
								if(activeService){
									if(jsonBody.source!='local'){
										this.log.info('Device %s, %s zone watering completed',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										this.activeZone[jsonBody.device_id]=false
									}
									activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
									activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
								}
								break
							case "device_idle":
								irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
								activeService=irrigationAccessory.getServiceById(Service.Switch, this.activeProgram)
								if(this.showRunall && switchServiceRunall){
									switchServiceRunall.getCharacteristic(Characteristic.On).updateValue(false)
									this.log.info('Running all zones completed')
								}
								if(activeService){
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
									this.log.info('Program %s completed',activeService.getCharacteristic(Characteristic.Name).value)
									activeService.getCharacteristic(Characteristic.On).updateValue(false)
									this.activeProgram=false
								}
								else{
									if(this.activeProgram){
										this.log.info('Program %s completed',this.activeProgram)
										this.activeProgram=false
									}
								}
								activeService=irrigationAccessory.getServiceById(Service.Valve, this.activeZone[jsonBody.device_id])
								if(activeService){
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
									this.log.info('Device %s idle',deviceName)
									activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
									activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
								}
								break
							case "change_mode":
								this.log.debug('%s mode changed to %s',deviceName,jsonBody.mode)
								//this.log.info(activeService.getCharacteristic(Characteristic.Name))
								switch (jsonBody.mode){
									case "auto":
										irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED)
										if(this.showStandby && switchServiceStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)}
										break
									case "manual":
										irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
										if(this.showStandby && switchServiceStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)}
										break
									case "off":
										irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
										if(this.showStandby && switchServiceStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(true)}
										break
									}
								break
							case "device_connected":
								this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
								irrigationAccessory.services.forEach((service)=>{
									if(Service.AccessoryInformation.UUID != service.UUID){
										if(Service.Battery.UUID != service.UUID){
										service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)
										}
									}
									if(Service.Valve.UUID == service.UUID){
										service.getCharacteristic(Characteristic.Active).getValue()
									}
									if(Service.Switch.UUID == service.UUID){
										service.getCharacteristic(Characteristic.On).getValue()
									}
								})
								break
							case "device_disconnected":
								this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',deviceName,jsonBody.timestamp)
								irrigationAccessory.services.forEach((service)=>{
									if(Service.AccessoryInformation.UUID != service.UUID){
										if(Service.Battery.UUID != service.UUID){
										service.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)
										}
									}
									if(Service.Valve.UUID == service.UUID){
										service.getCharacteristic(Characteristic.Active).getValue()
									}
									if(Service.Switch.UUID == service.UUID){
										service.getCharacteristic(Characteristic.On).getValue()
									}
								})
								break
							case "battery_status":
								percent=0
								if(jsonBody.mv){
									percent=jsonBody.mv/3000*100 > 100 ? 100 : jsonBody.mv/3000*100
								}
								else if(jsonBody.percent){
									percent=jsonBody.percent
								}
								if(jsonBody.charging==undefined){jsonBody.charging=false}
								this.log.debug('update battery status %s to %s%, charging=%s', deviceName, percent, jsonBody.charging)
								batteryService.getCharacteristic(Characteristic.ChargingState).updateValue(jsonBody.charging)
								batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(percent)
								break
							case "low_battery":
								this.log.warn('%s battery low',deviceName)
								activeService=irrigationAccessory.getServiceById(Service.Battery, jsonBody.device_id)
								if(activeService){
									activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
								}
								break
							case "device_status":
								if(this.showExtraDebugMessages){
									this.log.debug('%s updated at %s',deviceName,new Date(jsonBody.timestamp).toString())
								}
								break
							case "program_changed":
								this.log.info('%s program change',deviceName)
								break
							case "rain_delay":
								this.log.debug('%s rain delay',deviceName)
								break
							default:
								this.log.warn('Unknown sprinker device message received: %s',jsonBody.event)
							break
						}
					}
				}
				break
			case "bridge":
				let bridgeAccessory
				if(this.showBridge){
					bridgeAccessory=this.accessories[uuid]
						if(!bridgeAccessory){return}
						activeService=bridgeAccessory.getServiceById(Service.Tunnel, jsonBody.device_id)
				}
				switch (jsonBody.event){
					case "device_connected":
					this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
					if(this.showBridge){activeService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
						break
					case "device_disconnected":
					this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',deviceName,new Date(jsonBody.timestamp).toString())
					if(this.showBridge){activeService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)}
						break
					case "device_idle":
					//do nothing
						break
					case "change_mode":
					//do nothing
						break
					default:
					this.log.warn('Unknown bridge device message received: %s',jsonBody.event)
					break
				}
				break
			case "flood_sensor":
				let FSAccessory
				let leakService
				let tempService
				let batteryService
				let occupancySensor
				if(this.showFloodSensor || this.showTempSensor){
					FSAccessory=this.accessories[uuid]
					if(!FSAccessory){return}
					leakService=FSAccessory.getService(Service.LeakSensor)
					tempService=FSAccessory.getService(Service.TemperatureSensor)
					batteryService=FSAccessory.getService(Service.Battery)
					occupancySensor=FSAccessory.getService(Service.OccupancySensor)
						switch (jsonBody.event){
							case 'battery_status':
								this.log.debug('update battery status %s %s to %s%',jsonBody.location_name, jsonBody.name, jsonBody.battery.percent)
								batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.battery.percent)
								if(jsonBody.battery.percent<=this.lowBattery){
									batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
								}
								else{
									batteryService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
								}
								//batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(Math.floor((Math.random() * 100) + 1))
								break
							case "fs_status_update":
								//this.log.info('%s status update at %s',deviceName,new Date(jsonBody.timestamp).toString())
								if(this.showFloodSensor){
									switch (jsonBody.flood_alarm_status){
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
								if(this.showTempSensor){
									tempService.getCharacteristic(Characteristic.CurrentTemperature).updateValue((jsonBody.temp_f-32)*5/9)
								}
								if(this.showLimitsSensor){
									switch (jsonBody.temp_alarm_status){
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
							case "device_connected":
								this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
								if(this.showFloodSensor){leakService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
								if(this.showTempSensor){tempService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
								if(this.showLimitsSensor){occupancySensor.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
								break
							case "device_disconnected":
								this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',deviceName,new Date(jsonBody.timestamp).toString())
								if(this.showFloodSensor){leakService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)}
								if(this.showTempSensor){tempService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)}
								if(this.showLimitsSensor){occupancySensor.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)}
								break
						default:
							this.log.warn('Unknown flood sensor device message received: %s',jsonBody.event)
						break
						}
					}
					break
				default:
				this.log.warn('Unknown irrigation device message received: %s',jsonBody.event)
				break
			}
			return
		}catch(err){this.log.error('Error updating service %s', err)}
	}
}

module.exports=PlatformOrbit