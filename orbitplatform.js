'use strict'
let OrbitAPI=require('./orbitapi')
let OrbitUpdate=require('./orbitupdate')
let battery=require('./devices/battery')
let bridge=require('./devices/bridge')
let irrigation=require('./devices/irrigation')
let valve=require('./devices/valve')
let sensor=require('./devices/sensor')
let basicSwitch=require('./devices/switch')

class OrbitPlatform {
	constructor(log, config, api){
		this.orbitapi=new OrbitAPI(this, log)
		this.orbit=new OrbitUpdate(this, log, config)
		this.battery=new battery(this, log)
		this.bridge=new bridge(this, log)
		this.irrigation=new irrigation(this, log, config)
		this.valve=new valve(this, log, config)
		this.sensor=new sensor(this, log)
		this.basicSwitch=new basicSwitch(this, log)
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
		this.secondLastMessage={}
		this.endTime=[]
		this.activeZone=[]
		this.activeProgram=false
		this.meshNetwork
		this.meshId
		this.networkTopology
		this.networkTopologyId
		this.deviceGraph
		this.accessories=[]

		if(!config.email || !config.password){
			this.log.error('Valid email and password are required in order to communicate with the b-hyve, please check the plugin config')
		}
		else{
			this.log.info('Starting Orbit Platform using homebridge API', api.version)
		}
		//**
		//** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
		//**
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

				switch (newDevice.type){
					//Handle Water accessories
					case "sprinkler_timer":
						if(!this.showIrrigation){
							this.log.info('Skipping Irrigation System %s %s based on config', newDevice.hardware_version, newDevice.name)
							if(this.accessories[uuid]){
								this.log.debug('Removed cached device',device.id)
								this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
								delete this.accessories[uuid]
							}
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

						// ***** Create and configure Valve Service ***** //

						if(this.showSimpleValve && newDevice.hardware_version.includes('HT25')){
							this.log.debug('Creating and configuring new device')

							if(this.accessories[uuid]){
								// Check if accessory changed
								if(this.accessories[uuid].getService(Service.AccessoryInformation).getCharacteristic(Characteristic.ProductData).value != 'Valve'){
									this.log.warn('Changing from Irrigation to Valve, check room assignments in Homekit')
									this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
									delete this.accessories[uuid]
								}
							}

							let valveAccessory=this.valve.createValveAccessory(newDevice,newDevice.zones[0],uuid,this.accessories[uuid])
							let valveService=valveAccessory.getService(Service.Valve)
							this.valve.updateValveService(newDevice, newDevice.zones[0], valveService)
							this.valve.configureValveService(newDevice, valveService)
							// set current device status
							valveService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

							// Create and configure Battery Service if needed
							if(newDevice.battery!=null){
								this.log.info('Adding Battery status for %s', newDevice.name)
								let batteryStatus=valveAccessory.getService(Service.Battery)
								if(batteryStatus){ //update
									batteryStatus
										.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE)
										.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
										.setCharacteristic(Characteristic.BatteryLevel, newDevice.battery.percent)
								}
								else{ //add new
									batteryStatus=this.battery.createBatteryService(newDevice, uuid)
									this.battery.configureBatteryService(batteryStatus)
									valveAccessory.addService(batteryStatus)
									this.api.updatePlatformAccessories([valveAccessory])
								}
								batteryStatus=valveAccessory.getService(Service.Battery)
								valveAccessory.getService(Service.Valve).addLinkedService(batteryStatus)
							}
							else{ //remove
								this.log.debug('%s has no battery found, skipping add battery service', newDevice.name)
								let batteryStatus=valveAccessory.getService(Service.Battery)
								if(batteryStatus){
									valveAccessory.removeService(batteryStatus)
									this.api.updatePlatformAccessories([valveAccessory])
								}
							}

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
										let switchService=valveAccessory.getServiceById(Service.Switch, schedule.program)
										if(switchService){ //update
											switchService
												.setCharacteristic(Characteristic.On, false)
												.setCharacteristic(Characteristic.Name, device.name +' '+ schedule.name)
												.setCharacteristic(Characteristic.ConfiguredName, schedule.name +' '+ device.name)
												.setCharacteristic(Characteristic.SerialNumber, schedule.id)
												.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
											this.basicSwitch.configureSwitchService(newDevice, switchService)
											this.api.updatePlatformAccessories([valveAccessory])
										}
										else{ //add new
											switchService=this.basicSwitch.createScheduleSwitchService(newDevice, schedule)
											this.basicSwitch.configureSwitchService(newDevice, switchService)
											valveAccessory.addService(switchService, uuid)
											this.api.updatePlatformAccessories([valveAccessory])
										}
										valveAccessory.getService(Service.Valve).addLinkedService(switchService)
										this.api.updatePlatformAccessories([valveAccessory])
									}
									else{ //skip
										this.log.warn('Skipping switch for disabled program %s', schedule.name)
										let switchService=valveAccessory.getServiceById(Service.Switch, schedule.program)
										if(switchService){
											valveAccessory.removeService(switchService)
											this.api.updatePlatformAccessories([valveAccessory])
										}
									}
								})
							}
							else{ //remove
								let scheduleResponse=(await this.orbitapi.getTimerPrograms(this.token,newDevice).catch(err=>{this.log.error('Failed to get schedule for device', err)}))
								scheduleResponse.forEach((schedule)=>{
									this.log.debug('removed schedule switch')
									let switchService=valveAccessory.getServiceById(Service.Switch, schedule.program)
									if(switchService){
										valveAccessory.removeService(switchService)
										this.api.updatePlatformAccessories([valveAccessory])
									}
								})
							}

							if(this.showStandby){
								let switchType='Standby'
								this.log.debug('adding new standby switch')
								let switchService=valveAccessory.getService(Service.Switch)
								if(switchService){ //update
									switchService
										.setCharacteristic(Characteristic.Name, newDevice.name +' '+ switchType)
										.setCharacteristic(Characteristic.ConfiguredName, switchType +' '+ newDevice.name)
										.setCharacteristic(Characteristic.StatusFault, !newDevice.is_connected)
									this.basicSwitch.configureSwitchService(newDevice, switchService)
									this.api.updatePlatformAccessories([valveAccessory])
								}
								else{ //add new
									switchService=this.basicSwitch.createSwitchService(newDevice, switchType)
									this.basicSwitch.configureSwitchService(newDevice, switchService)
									valveAccessory.addService(switchService, uuid)
									this.api.updatePlatformAccessories([valveAccessory])
								}
								valveAccessory.getService(Service.Valve).addLinkedService(switchService)
								this.api.updatePlatformAccessories([valveAccessory])
							}
							else{ //remove
								this.log.debug('removed standby switch')
								let switchService=valveAccessory.getService(Service.Switch)
								if(switchService){
									valveAccessory.removeService(switchService)
									this.api.updatePlatformAccessories([valveAccessory])
								}
							}

								// Register platform accessory
								if(!this.accessories[uuid]){
									this.log.debug('Registering platform accessory')
									this.log.info('Adding new accessory %s', valveAccessory.displayName)
									this.accessories[uuid]=valveAccessory
									this.api.registerPlatformAccessories(PluginName, PlatformName, [valveAccessory])
								}
							}

						// ***** Create and configure Irrigation Service ***** //

						else{
							this.log.debug('Creating and configuring new device')

							if(this.accessories[uuid]){
								// Check if accessory changed
								if(this.accessories[uuid].getService(Service.AccessoryInformation).getCharacteristic(Characteristic.ProductData).value != 'Irrigation'){
									this.log.warn('Changing from Valve to Irrigation, check room assignments in Homekit')
									this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
									delete this.accessories[uuid]
								}
							}

							let irrigationAccessory=this.irrigation.createIrrigationAccessory(newDevice,uuid,this.accessories[uuid])
							let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
							this.irrigation.configureIrrigationService(newDevice,irrigationSystemService)
							// set current device status
							irrigationSystemService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

							// Create and configure Battery Service if needed
							if(newDevice.battery!=null){
								this.log.info('Adding Battery status for %s', newDevice.name)
								let batteryStatus=irrigationAccessory.getService(Service.Battery)
								if(batteryStatus){ //update
									batteryStatus
										.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE)
										.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
										.setCharacteristic(Characteristic.BatteryLevel, newDevice.battery.percent)
								}
								else{ //add new
									batteryStatus=this.battery.createBatteryService(newDevice, uuid)
									this.battery.configureBatteryService(batteryStatus)
									irrigationAccessory.addService(batteryStatus)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
								batteryStatus=irrigationAccessory.getService(Service.Battery)
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(batteryStatus)
							}
							else{ //remove
								this.log.debug('%s has no battery found, skipping add battery service', newDevice.name)
								let batteryStatus=irrigationAccessory.getService(Service.Battery)
								if(batteryStatus){
									irrigationAccessory.removeService(batteryStatus)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
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
									let valveService=irrigationAccessory.getServiceById(Service.Valve, zone.station)
									if(valveService){
										valveService
											.setCharacteristic(Characteristic.ValveType, this.useIrrigationDisplay ? 1 : this.displayValveType)
											.setCharacteristic(Characteristic.RemainingDuration, 0)
											.setCharacteristic(Characteristic.ServiceLabelIndex, zone.station)
											.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
											.setCharacteristic(Characteristic.SerialNumber, UUIDGen.generate("zone-" + zone.station))
											.setCharacteristic(Characteristic.Name, zone.name)
											.setCharacteristic(Characteristic.ConfiguredName, zone.name)
											.setCharacteristic(Characteristic.Model, zone.sprinkler_type)
										if (zone.enabled) {
											valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
										}
										else {
											valveService.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
										}
										this.irrigation.configureValveService(newDevice, valveService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									}
									else{ // add new
										valveService=this.irrigation.createValveService(newDevice, zone)
										this.irrigation.configureValveService(newDevice, valveService)
										irrigationAccessory.addService(valveService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									}

									if(this.useIrrigationDisplay){
										this.log.debug('Using Irrigation system')
										irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(valveService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									}
									else{
										this.log.debug('Using separate tiles')
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
										let switchService=irrigationAccessory.getServiceById(Service.Switch, schedule.program)
										if(switchService){ //update
											switchService
												.setCharacteristic(Characteristic.On, false)
												.setCharacteristic(Characteristic.Name, device.name +' '+ schedule.name)
												.setCharacteristic(Characteristic.ConfiguredName, schedule.name +' '+ device.name)
												.setCharacteristic(Characteristic.SerialNumber, schedule.id)
												.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
											this.basicSwitch.configureSwitchService(newDevice, switchService)
											irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
										}
										else{ //add new
											switchService=this.basicSwitch.createScheduleSwitchService(newDevice, schedule)
											this.basicSwitch.configureSwitchService(newDevice, switchService)
											irrigationAccessory.addService(switchService, uuid)
											this.api.updatePlatformAccessories([irrigationAccessory])
										}
										irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									}
									else{ //skip
										this.log.warn('Skipping switch for disabled program %s', schedule.name)
										let switchService=irrigationAccessory.getServiceById(Service.Switch, schedule.program)
										if(switchService){
											irrigationAccessory.removeService(switchService)
											this.api.updatePlatformAccessories([irrigationAccessory])
										}
									}
								})
							}
							else{ //remove
								let scheduleResponse=(await this.orbitapi.getTimerPrograms(this.token,newDevice).catch(err=>{this.log.error('Failed to get schedule for device', err)}))
								scheduleResponse.forEach((schedule)=>{
									this.log.debug('removed schedule switch')
									let switchService=irrigationAccessory.getServiceById(Service.Switch, schedule.program)
									if(switchService){
										irrigationAccessory.removeService(switchService)
										this.api.updatePlatformAccessories([irrigationAccessory])
									}
								})
							}

							if(this.showRunall){
								let switchType='Run All'
								this.log.debug('adding new run all switch')
								let uuid = UUIDGen.generate(newDevice.id + switchType)
								let switchService=irrigationAccessory.getServiceById(Service.Switch, uuid)
								if(switchService){ //update
									switchService
										.setCharacteristic(Characteristic.Name, newDevice.name +' '+ switchType)
										.setCharacteristic(Characteristic.ConfiguredName, switchType +' '+ newDevice.name)
										.setCharacteristic(Characteristic.StatusFault, !newDevice.is_connected)
									this.basicSwitch.configureSwitchService(newDevice, switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
								else{ //add new
									switchService=this.basicSwitch.createSwitchService(newDevice, switchType)
									this.basicSwitch.configureSwitchService(newDevice, switchService)
									irrigationAccessory.addService(switchService, uuid)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							}
							else{ //remove
								let switchType='Run All'
								this.log.debug('removed run all switch')
								let uuid = UUIDGen.generate(newDevice.id + switchType)
								let switchService=irrigationAccessory.getServiceById(Service.Switch, uuid)
								if(switchService){
									irrigationAccessory.removeService(switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
							}

							if(this.showStandby){
								let switchType='Standby'
								this.log.debug('adding new standby switch')
								let uuid = UUIDGen.generate(newDevice.id + switchType)
								let switchService=irrigationAccessory.getServiceById(Service.Switch, uuid)
								if(switchService){ //update
									switchService
										.setCharacteristic(Characteristic.Name, newDevice.name +' '+ switchType)
										.setCharacteristic(Characteristic.ConfiguredName, switchType +' '+ newDevice.name)
										.setCharacteristic(Characteristic.StatusFault, !newDevice.is_connected)
									this.basicSwitch.configureSwitchService(newDevice, switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
							}
								else{ //add new
									switchService=this.basicSwitch.createSwitchService(newDevice, switchType)
									this.basicSwitch.configureSwitchService(newDevice, switchService)
									irrigationAccessory.addService(switchService, uuid)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
								irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
								this.api.updatePlatformAccessories([irrigationAccessory])
							}
							else{ //remove
								let switchType='Standby'
								this.log.debug('removed standby switch')
								let uuid = UUIDGen.generate(newDevice.id + switchType)
								let switchService=irrigationAccessory.getServiceById(Service.Switch, uuid)
								if(switchService){
									irrigationAccessory.removeService(switchService)
									this.api.updatePlatformAccessories([irrigationAccessory])
								}
							}
							// Register platform accessory
							if(!this.accessories[uuid]){
								this.log.debug('Registering platform accessory')
								this.log.info('New accessory %s', irrigationAccessory.displayName)
								this.accessories[uuid]=irrigationAccessory
								this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
							}
						}
						break
					// Handle Bridge accessories
					case "bridge":
						let bridgeAccessory
						let bridgeService
						let service
						if(!this.showBridge){
							this.log.info('Skipping Bridge %s %s based on config', newDevice.hardware_version, newDevice.name)
							if(this.accessories[uuid]){
								this.log.debug('Removed cached device',device.id)
								this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
								delete this.accessories[uuid]
							}
							return
						}
						this.log.debug('Adding Bridge Device')
						this.log.debug('Found device %s', newDevice.name)
						//switch (newDevice.hardware_version){
						switch (newDevice.hardware_version.split("-")[0]){ //look for any rev
							//case "BH1-0001":
							case "BH1":
								// Create and configure Gen 1Bridge Service
								let meshNetwork=(await this.orbitapi.getMeshes(this.token,newDevice.mesh_id).catch(err=>{this.log.error('Failed to add G1 bridge %s', err)}))
								this.log.debug('Creating and configuring new bridge')
								bridgeAccessory=this.bridge.createBridgeAccessory(newDevice, uuid, this.accessories[uuid])
								bridgeService=bridgeAccessory.getService(Service.Tunnel)
								bridgeService=this.bridge.createBridgeService(newDevice,meshNetwork,false)
								this.bridge.configureBridgeService(bridgeService)
								// Set current device status
								bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)
								service=bridgeAccessory.getService(Service.Tunnel)
								if(!service){
									bridgeAccessory.addService(bridgeService)
								}
								this.log.info('Adding Gen-1 Bridge')
								break
							//case "BH1G2-0000":
							//case "BH1G2-0001":
							case "BH1G2":
								// Create and configure Gen2 Bridge Service
								let networkTopology=(await this.orbitapi.getNetworkTopologies(this.token,newDevice.network_topology_id).catch(err=>{this.log.error('Failed to add G2 bridge %s', err)}))
								this.log.debug('Creating and configuring new bridge')
								bridgeAccessory=this.bridge.createBridgeAccessory(newDevice, uuid, this.accessories[uuid])
								bridgeService=bridgeAccessory.getService(Service.Tunnel)
								bridgeService=this.bridge.createBridgeService(newDevice,networkTopology,true)
								this.bridge.configureBridgeService(bridgeService)
								// set current device status
								bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)
								service=bridgeAccessory.getService(Service.Tunnel)
								if(!service){
									bridgeAccessory.addService(bridgeService)
								}
								this.log.info('Adding Gen-2 Bridge')
								break
							default:
								this.log.warn('Wifi Hub hardware %s, not supported',newDevice.hardware_version)
								return
						}
						if(!this.accessories[uuid]){
							this.log.debug('Registering platform accessory')
							this.accessories[uuid]=bridgeAccessory
							this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
						}
						break
					// Handle Flood sensor accessories
					case "flood_sensor":
						if(!this.showFloodSensor && !this.showTempSensor && !this.showLimitsSensor){
							this.log.info('Skipping Flood Sensor %s %s based on config', newDevice.hardware_version, newDevice.name)
							if(this.accessories[uuid]){
								this.log.debug('Removed cached device',device.id)
								this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
								delete this.accessories[uuid]
							}
							return
						}
						this.log.debug('Adding Flood Sensor Device')
						this.log.debug('Found device %s',newDevice.name)
						let FSAccessory
						let batteryStatus
						if(this.showFloodSensor || this.showTempSensor || this.showLimitsSensor){
							FSAccessory=this.sensor.createFloodAccessory(newDevice, uuid, this.accessories[uuid])
							if(!this.accessories[uuid]){
							this.log.debug('Registering platform accessory')
							this.accessories[uuid]=FSAccessory
							this.api.registerPlatformAccessories(PluginName, PlatformName, [FSAccessory])
							}
							this.log.info('Adding Battery status for %s %s',newDevice.location_name, newDevice.name)
							batteryStatus=this.battery.createBatteryService(newDevice, uuid)
							this.battery.configureBatteryService(batteryStatus)
							let service=FSAccessory.getService(Service.Battery)
							if(!service){
								FSAccessory.addService(batteryStatus)
								this.api.updatePlatformAccessories([FSAccessory])
							}
							// Refresh battery status every so often for flood sensors
							setInterval(async()=>{
								try{
									let sensorResponse=(await this.orbitapi.getDevice(this.token, newDevice.id).catch(err=>{this.log.error('Failed to get device response %s', err)}))
									this.log.debug('check battery status %s %s',sensorResponse.location_name, sensorResponse.name)
									sensorResponse.device_id=sensorResponse.id
									sensorResponse.event='battery_status'
									this.orbit.updateService.bind(this)(JSON.stringify(sensorResponse))
								}catch(err){this.log.error('Failed to read each sensor', err)}
							}, 4*60*60*1000) //4 hours in ms
						}
						else{
							if(this.accessories[uuid]){
								this.log.debug('Removed cached device',device.id)
								this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
								delete this.accessories[uuid]
							}
						}

						if(this.showFloodSensor){
							this.log.info('Adding Flood Sensor for %s %s',newDevice.location_name, newDevice.name)
							let leakSensor=this.sensor.createLeakService(newDevice)
							this.sensor.configureLeakService(leakSensor)
							let service=FSAccessory.getService(Service.LeakSensor)
							if(!service){
								FSAccessory.addService(leakSensor)
								this.api.updatePlatformAccessories([FSAccessory])
							}
							else{
								let currentAlarm
								switch (newDevice.status.flood_alarm_status) {
									case 'ok':
										currentAlarm = false
										break
									case 'alarm':
										currentAlarm = true
										break
									default:
										currentAlarm = false
										break
								}
								service
									.setCharacteristic(Characteristic.LeakDetected, currentAlarm)
									.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
							}
						}
						else{
							let service=FSAccessory.getService(Service.LeakSensor)
							if(service){
								FSAccessory.removeService(service)
								this.api.updatePlatformAccessories([FSAccessory])
							}
						}
						if(this.showTempSensor){
							this.log.info('Adding Temperature Sensor for %s %s',newDevice.location_name, newDevice.name)
							let tempSensor=this.sensor.createTempService(newDevice)
							this.sensor.configureTempService(tempSensor)
							let service=FSAccessory.getService(Service.TemperatureSensor)
							if(!service){
								FSAccessory.addService(tempSensor)
								this.api.updatePlatformAccessories([FSAccessory])
							}
							else{
								service
									.setCharacteristic(Characteristic.CurrentTemperature, (newDevice.status.temp_f - 32) * 5 / 9)
									.setCharacteristic(Characteristic.StatusFault, !newDevice.is_connected)
							}
						}
						else{
							let service=FSAccessory.getService(Service.TemperatureSensor)
							if(service){
								FSAccessory.removeService(service)
								this.api.updatePlatformAccessories([FSAccessory])
							}
						}
						if(this.showLimitsSensor){
							let occupancySensor=this.sensor.createOccupancyService(newDevice)
							this.sensor.configureOccupancyService(occupancySensor)
							let service=FSAccessory.getService(Service.OccupancySensor)
							if(!service){
								FSAccessory.addService(occupancySensor)
								this.api.updatePlatformAccessories([FSAccessory])
							}
							else{
								service
									.setCharacteristic(Characteristic.StatusFault, !newDevice.is_connected)
							}
						}
						else{
							let service=FSAccessory.getService(Service.OccupancySensor)
							if(service){
								FSAccessory.removeService(service)
								this.api.updatePlatformAccessories([FSAccessory])
							}
						}
						break
					default:
					// do nothing
				}

				this.log.debug('Establish connection for %s',newDevice.name)
				this.orbitapi.openConnection(this.token, newDevice)
				this.orbitapi.onMessage(this.token, newDevice, this.orbit.updateService.bind(this))
				this.irrigation.localMessage(this.orbit.updateService.bind(this))
				this.valve.localMessage(this.orbit.updateService.bind(this))
				// Send Sync after 2 sec delay, match state to bhyve state
				setTimeout(()=>{this.orbitapi.sync(this.token, newDevice)}, 2000)
			})
			setTimeout(()=>{this.log.info('Orbit Platform finished loading')}, 2000)
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
}

module.exports=OrbitPlatform