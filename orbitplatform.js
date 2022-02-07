'use strict'
let OrbitAPI=require('./orbitapi')
let battery=require('./devices/battery')
let bridge=require('./devices/bridge')
let irrigation=require('./devices/irrigation')
let sensor=require('./devices/sensor')

class PlatformOrbit {

  constructor(log, config, api){
    this.orbitapi=new OrbitAPI(this,log)
		this.battery=new battery(this,log)
		this.bridge=new bridge(this,log)
		this.irrigation=new irrigation(this,log)
		this.sensor=new sensor(this,log)
    this.log=log
    this.config=config
    this.email=config.email
    this.password=config.password
    this.token
    this.userId
    this.useIrrigationDisplay=config.useIrrigationDisplay
    this.displayValveType=config.displayValveType
    this.defaultRuntime=config.defaultRuntime*60
		this.runtimeSource=config.runtimeSource
    this.showStandby=config.showStandby
    this.showRunall=config.showRunall
    this.showSchedules=config.showSchedules
    this.locationAddress=config.locationAddress
    this.locationMatch=true
		this.showIrrigation=config.showIrrigation
    this.showBridge=config.showBridge
		this.showFloodSensor=config.showFloodSensor
		this.showTempSensor=config.showTempSensor
		this.showLimitsSensor=config.showLimitsSensor
    this.showIncomingMessages=false
    this.showOutgoingMessages=false
    this.lastMessage
    this.activeZone
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
          // Get devices
          this.getDevices()
        }.bind(this))
      }
    }

  identify (){
    this.log.info('Identify the sprinkler!')
  }

  getDevices(){
    this.log.debug('Fetching Build info...')
    this.log.info('Getting Account info...')
    // login to the API and get the token
    this.orbitapi.getToken(this.email,this.password).then(response=>{
      this.log.info('Found account for',response.data.user_name)
      this.log.debug('Found token',response.data.orbit_api_key)  
      this.token=response.data.orbit_api_key
      this.userId=response.data.user_id  
      this.orbitapi.getDeviceGraph(this.token,this.userId).then(response=>{
        this.log.debug('Found device graph for user id %s, %s',this.userId,response.data)
        this.deviceGraph=response.data
      }).catch(err=>{this.log.error('Failed to get graph response %s', err)})
        // get an array of the devices
        this.orbitapi.getDevices(this.token, this.userId).then(response=>{
					response.data=response.data.sort(function (a, b){ // read bridge info first
						return a.type > b.type ? 1
									:a.type < b.type ? -1
									:0
					})				
         	response.data.filter((device)=>{
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
									this.orbitapi.getNetworkTopologies(this.token,device.network_topology_id).then(response=>{
										this.networkTopology=response.data
									}).catch(err=>{this.log.error('Failed to get network topology %s', err)})
              	}
								if(device.mesh_id){
									this.meshId=device.mesh_id
									this.orbitapi.getMeshes(this.token,device.mesh_id).then(response=>{
										this.meshNetwork=response.data
									}).catch(err=>{this.log.error('Failed to get network mesh %s', err)})
              	}
							}
              else{
                this.log.info('Offline device %s %s found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1)
								this.log.warn('%s is disconnected! This will show as non-responding in Homekit until the connection is restored.',device.name)
              }
              this.locationMatch=true
            }
						else if(device.address.line_1 =='undefined location' && (this.networkTopologyId==device.network_topology_id || this.meshId==device.mesh_id)){ 
              if(device.is_connected){
                this.log.info('Online device %s %s found for the location: %s',device.hardware_version,device.name,device.location_name)
              }
              else{
                this.log.info('Offline device %s %s found for the location: %s',device.hardware_version,device.name,device.location_name)
								this.log.warn('%s is disconnected! This will show as non-responding in Homekit until the connection is restored.',device.name)
              }
              this.locationMatch=true
						}
            else{
              this.log.info('Skipping device %s %s at %s, not found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1,this.locationAddress)
              this.locationMatch=false
            }
            return this.locationMatch 
          }).forEach((newDevice)=>{
            // adding devices that met filter criteria
            let uuid=UUIDGen.generate(newDevice.id)
            switch (newDevice.type){
              case "sprinkler_timer":
								if(!this.showIrrigation){
									this.log.info('Skipping Irrigation System %s %s based on config', newDevice.hardware_version, newDevice.name)
									return
								}
                this.log.debug('Adding Sprinkler Timer Device')
								if(newDevice.status.run_mode){
									this.log.debug('Found device %s with status %s',newDevice.name,newDevice.status.run_mode) 
								}
								else{
									this.log.warn('Found device %s with an unknown status %s, please check connection status',newDevice.name)
								}
                // Remove cached accessory
                this.log.debug('Removed cached device')
                let switchService
                if(this.accessories[uuid]){
                  this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                  delete this.accessories[uuid]
                }
								// Create and configure Irrigation Service
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
									//irrigationAccessory.getService(Service.IrrigationSystem)
									irrigationAccessory.addService(batteryStatus)
								}
								else {
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
									else {
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
                this.orbitapi.getTimerPrograms(this.token,newDevice).then(response=>{
                  response.data.forEach((schedule)=>{
                    this.log.debug('adding schedules %s program %s',schedule.name, schedule.program )
                    switchService=this.irrigation.createScheduleSwitchService(newDevice, schedule)
                    this.irrigation.configureSwitchService(newDevice, switchService)
                    irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
                    irrigationAccessory.addService(switchService)
                  })
                }).catch(err=>{this.log.error('Failed to get schedule for device', err)})        
              }       
              if(this.showRunall){
                this.log.debug('adding new run all switch')
                switchService=this.irrigation.createSwitchService(newDevice,' Run All')
                this.irrigation.configureSwitchService(newDevice, switchService)
                irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
                irrigationAccessory.addService(switchService)
                }
              if(this.showStandby){
                this.log.debug('adding new standby switch')
                switchService=this.irrigation.createSwitchService(newDevice,' Standby')
                this.irrigation.configureSwitchService(newDevice, switchService)
                irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService) 
                irrigationAccessory.addService(switchService)
              }

              // Register platform accessory
							this.log.debug('Registering platform accessory');
							this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
							this.accessories[uuid]=irrigationAccessory
            break
            case "bridge":
							if(!this.showBridge){
								this.log.info('Skipping Bridge %s %s based on config', newDevice.hardware_version, newDevice.name)
								return
							}
							this.log.debug('Adding Bridge Device')
							this.log.debug('Found device %s', newDevice.name) 				
              // Remove cached accessory
              this.log.debug('Removed cached device')
              if(this.accessories[uuid]){
                this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                delete this.accessories[uuid]
              }
							switch (newDevice.hardware_version){
								case "BH1-0001":
									// Create and configure Gen 1Bridge Service
									this.orbitapi.getMeshes(this.token,newDevice.mesh_id).then(response=>{
										this.meshNetwork=response.data
										this.log.debug('Creating and configuring new bridge')                       
										let bridgeAccessory=this.bridge.createBridgeAccessory(newDevice,uuid)
										let bridgeService=bridgeAccessory.getService(Service.Tunnel)
										bridgeService=this.bridge.createBridgeService(newDevice,this.meshNetwork,false)
										this.bridge.configureBridgeService(bridgeService)

										// set current device status 
										bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)	
										
										bridgeAccessory.addService(bridgeService)
										this.accessories[uuid]=bridgeAccessory                     
										this.log.info('Adding Gen-1 Bridge')
										this.log.debug('Registering platform accessory')
										this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
									}).catch(err=>{this.log.error('Failed to add G1 bridge %s', err)})
								break
								case "BH1G2-0001":
									// Create and configure Gen2 Bridge Service
									this.orbitapi.getNetworkTopologies(this.token,newDevice.network_topology_id).then(response=>{
										this.networkTopology=response.data
										this.log.debug('Creating and configuring new bridge')                       
										let bridgeAccessory=this.bridge.createBridgeAccessory(newDevice,uuid)
										let bridgeService=bridgeAccessory.getService(Service.Tunnel)
										bridgeService=this.bridge.createBridgeService(newDevice,this.networkTopology,true)
										this.bridge.configureBridgeService(bridgeService)

										// set current device status 
										bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)	
										
										bridgeAccessory.addService(bridgeService)
										this.accessories[uuid]=bridgeAccessory                     
										this.log.info('Adding Gen-2 Bridge')
										this.log.debug('Registering platform accessory')
										this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
									}).catch(err=>{this.log.error('Failed to add G2 bridge %s', err)})
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
							if(this.accessories[uuid]){
								this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
								delete this.accessories[uuid]
							}

							if(this.showFloodSensor || this.showTempSensor || this.showLimitsSensor){
								FSAccessory=this.sensor.createFloodAccessory(newDevice,uuid)
								this.log.info('Adding Battery status for %s %s',newDevice.location_name, newDevice.name)
								let batteryStatus=this.battery.createBatteryService(newDevice)
								this.battery.configureBatteryService(batteryStatus)
								FSAccessory.getService(Service.Battery)
								FSAccessory.addService(batteryStatus)
								this.accessories[uuid]=FSAccessory                     					
								this.log.debug('Registering platform accessory')
								this.api.registerPlatformAccessories(PluginName, PlatformName, [FSAccessory])
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
          this.log.debug('establish connection for %s',newDevice.name)
          this.orbitapi.openConnection(this.token, newDevice)
          this.orbitapi.onMessage(this.token, newDevice, this.updateService.bind(this))
          // Send Sync after 2 sec delay, match state to bhyve state 
          setTimeout(()=>{this.orbitapi.sync(this.token, newDevice)}, 2000)
        })
				setTimeout(()=>{this.log.info('Orbit Platform finished loading')}, 500)
      }).catch(err=>{this.log.error('Failed to get token', err)})
    }).catch(err=>{this.log.error('Failed to get info for build', err)})

		// Refresh battery status every so often for flood sensors if netowrk exsits
		setInterval(()=>{		
			try{			
				if(this.networkTopologyId){
					this.networkTopology.devices.forEach((sensor)=>{
						this.orbitapi.getDevice(this.token,sensor.device_id).then(response=>{
							this.log.debug('check battery status %s %s @ %s',response.data.location_name, response.data.name, response.data.battery.percent)
							response.data.device_id=response.data.id
							response.data.event='battery'
							this.updateService(JSON.stringify(response.data))
						}).catch(err=>{this.log.error('Failed to get device response %s', err)})
					})
				}
			}catch(err){this.log.error('Failed to read each sensor', err)}	
		}, 4*60*60*1000) //4 hours in ms
	}

  //**
  //** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
  //**
  configureAccessory(accessory){
    // Added cached devices to the accessories arrary
    this.log.debug('Found cached accessory %s', accessory.displayName);
    this.accessories[accessory.UUID]=accessory;
  }
  
  updateService(message){
		//process incoming messages
    try{
      let jsonBody=JSON.parse(message)
      let deviceName=this.deviceGraph.devices.filter(result=>result.id == jsonBody.device_id)[0].name
      let eventType=this.deviceGraph.devices.filter(result=>result.id == jsonBody.device_id)[0].type
      let activeService
      let uuid=UUIDGen.generate(jsonBody.device_id)
      /*****************************
           Possible states
      Active	InUse	  HomeKit Shows
      False	  False	  Off
      True  	False	  Idle
      True	  True	  Running
      False	  True	  Stopping
      ******************************/
      if(this.showIncomingMessages){this.log.warn('incoming message',jsonBody)} //additional debug info
      if(this.lastMessage==message){return} //suppress duplicate websocket messages
      this.lastMessage=message
      switch (eventType){
        case "sprinkler_timer":
					let irrigationAccessory
					if(this.showIrrigation){
						irrigationAccessory=this.accessories[uuid]
						if(!irrigationAccessory){return}
						let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
						let switchServiceStandby=irrigationAccessory.getServiceById(Service.Switch,UUIDGen.generate(jsonBody.device_id+' Standby'))
						let switchServiceRunall=irrigationAccessory.getServiceById(Service.Switch,UUIDGen.generate(jsonBody.device_id+' Run All'))   
					switch (jsonBody.event){        
						case "watering_in_progress_notification":
							irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
							activeService=irrigationAccessory.getServiceById(Service.Valve, jsonBody.current_station)
							if(activeService){
								//stop last if program is running
								if(jsonBody.program!= 'manual'){
									if(this.showSchedules){
										this.log.info('Running Program %s',irrigationAccessory.getServiceById(Service.Switch, jsonBody.program).getCharacteristic(Characteristic.Name).value)
									}
									else{
										this.log.info('Running Program %s',jsonBody.program)
									}
									this.activeProgram=jsonBody.program
									if(this.activeZone){
										activeService=irrigationAccessory.getServiceById(Service.Valve, this.activeZone)
										if(jsonBody.source!='local'){
											this.log.info('Device %s, %s zone watering completed',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
										}
										activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
										activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
									}
								}
								//start new
								activeService=irrigationAccessory.getServiceById(Service.Valve, jsonBody.current_station)
								if(jsonBody.source!='local'){
									this.log.info('Device %s, %s zone watering in progress for %s mins',deviceName, activeService.getCharacteristic(Characteristic.Name).value, Math.round(jsonBody.run_time))
									this.activeZone=jsonBody.current_station
								}
								activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
								activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
								activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(jsonBody.run_time * 60)
								let endTime= new Date(Date.now() + parseInt(jsonBody.run_time) * 60 * 1000).toISOString()
								activeService.getCharacteristic(Characteristic.CurrentTime).updateValue(endTime)        
							}
						break
						case "watering_complete":
							irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
							activeService=irrigationAccessory.getServiceById(Service.Valve, this.activeZone)
							if(activeService){
								if(jsonBody.source!='local'){
									this.log.info('Device %s, %s zone watering completed',deviceName, activeService.getCharacteristic(Characteristic.Name).value)
									this.activeZone=false
								}
								activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
								activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
							}
							
						break
						case "device_idle":
							irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
							activeService=irrigationAccessory.getServiceById(Service.Switch, this.activeProgram)
							if(this.showRunall && switchServiceRunall.getCharacteristic(Characteristic.On).value){
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
							activeService=irrigationAccessory.getServiceById(Service.Valve, this.activeZone)
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
									irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED)
									if(this.showStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)}
								break
								case "manual":
									irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
									if(this.showStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(false)}
								break
								case "off":
									irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
									if(this.showStandby){switchServiceStandby.getCharacteristic(Characteristic.On).updateValue(true)}
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
						case "clear_low_battery":
							this.log.debug('%s low battery cleared',deviceName)
							activeService=irrigationAccessory.getServiceById(Service.Battery, jsonBody.device_id)
							if(activeService){
								activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
							}
						break    
						case "low_battery":
							this.log.warn('%s battery low',deviceName)
							activeService=irrigationAccessory.getServiceById(Service.Battery, jsonBody.device_id)
							if(activeService){
								activeService.getCharacteristic(Characteristic.StatusLowBattery).updateValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
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
            this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',deviceName,jsonBody.timestamp)
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
						case 'battery':
								this.log.debug('update battery status %s %s @ %s',jsonBody.location_name, jsonBody.name, jsonBody.battery.percent)
								batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(jsonBody.battery.percent)
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
							this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',deviceName,jsonBody.timestamp)
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
				this.log.warn('Unknown device message received: %s',jsonBody.event)
			break	
      }
   	return
    }catch(err){this.log.error('Error updating service %s', err)}
  }
}

module.exports=PlatformOrbit