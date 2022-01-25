/* todo list
What to do with Bridge
Known issues 
Run multiple API does not work, even if run from hhyve site.
API does not return program end
*/

'use strict'
let packageJson=require('./package')
let OrbitAPI=require('./orbitapi.js')

class PlatformOrbit {

  constructor(log, config, api){
    this.orbitapi=new OrbitAPI(this,log)
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
		this.networkTopology
		this.networkTopologyId
    this.deviceGraph
    this.accessories=[]
    if(!config.email || !config.password){
      this.log.error('Valid email and passwoard are required in order to communicate with the b-hyve, please check the plugin config')
    }
      this.log('Starting Orbit Platform using homebridge API', api.version)
      if(api){
        this.api=api
        this.api.on("didFinishLaunching", function (){
          // Get devices
          this.getDevices()
        }.bind(this))
      }
    }

  identify (){
    this.log('Identify the sprinkler!')
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
        this.orbitapi.getDevices(this.token).then(response=>{
					response.data=response.data.sort(function (a, b){ //read bridge info first
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
							"postal_code":"",
							"country":""
							}
							this.log.debug('No location address defined, adding dummy location %s',device.address)
						}
            if(!this.locationAddress || this.locationAddress==device.address.line_1){  
              if(device.is_connected){
                this.log.info('Online device %s %s found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1)
								if(device.network_topology_id){
									this.networkTopologyId=device.network_topology_id
              	}
							}
              else{
                this.log.info('Offline device %s %s found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1)
              }
              this.locationMatch=true
            }
						else if(this.networkTopologyId==device.network_topology_id){ 
              if(device.is_connected){
                this.log.info('Online device %s %s found for the location: %s',device.hardware_version,device.name,device.location_name)
              }
              else{
                this.log.info('Offline device %s %s found for the location: %s',device.hardware_version,device.name,device.location_name)
              }
              this.locationMatch=true
						}
            else{
              this.log.info('Skipping device %s %s at %s, not found at the configured location address: %s',device.hardware_version,device.name,device.address.line_1,this.locationAddress)
              this.locationMatch=false
            }
            return this.locationMatch 
          }).forEach((newDevice)=>{
            //adding devices that met filter criteria
            let uuid=UUIDGen.generate(newDevice.id)
            switch (newDevice.type){
              case "sprinkler_timer":
                this.log.debug('Adding Sprinkler Timer Device')
								if(newDevice.status.run_mode){
									this.log.debug('Found device %s with status %s',newDevice.name,newDevice.status.run_mode) 
								}
								else{
									this.log.warn('Found device %s with an unknown status %s, please check connection status',newDevice.name)
								}
                //Remove cached accessory
                this.log.debug('Removed cached device')
                let switchService
                if(this.accessories[uuid]){
                  this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                  delete this.accessories[uuid]
                }
								// Create and configure Irrigation Service
								this.log.debug('Creating and configuring new device')                
								let irrigationAccessory=this.createIrrigationAccessory(newDevice,uuid)
								let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
								this.configureIrrigationService(newDevice,irrigationSystemService)
								
								//set current device status 
								irrigationSystemService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)

								// Create and configure Battery Service if needed
								if(newDevice.battery!=null){
									this.log.info('Adding Battery status for %s', newDevice.name)
									let batteryStatus=this.createBatteryService(newDevice)
									this.configureBatteryService(batteryStatus)
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
										let valveService=this.createValveService(zone, newDevice.manual_preset_runtime_sec)
										this.configureValveService(newDevice, valveService)
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
                    switchService=this.createScheduleSwitchService(schedule)
                    this.configureSwitchService(newDevice, switchService)
                    irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
                    irrigationAccessory.addService(switchService)
                  })
                }).catch(err=>{this.log.error('Failed to get schedule for device', err)})        
              }       
              if(this.showRunall){
                this.log.debug('adding new run all switch')
                switchService=this.createSwitchService(newDevice,' Run All')
                this.configureSwitchService(newDevice, switchService)
                irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService)
                irrigationAccessory.addService(switchService)
                }
              if(this.showStandby){
                this.log.debug('adding new standby switch')
                switchService=this.createSwitchService(newDevice,' Standby')
                this.configureSwitchService(newDevice, switchService)
                irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(switchService) 
                irrigationAccessory.addService(switchService)
              }

              // Register platform accessory
              this.log.debug('Registering platform accessory');
              this.api.registerPlatformAccessories(PluginName, PlatformName, [irrigationAccessory])
              this.accessories[uuid]=irrigationAccessory
            break
            case "bridge":
							this.log.debug('Adding Bridge Device')
							this.log.debug('Found device %s',newDevice.name) 				
              //Remove cached accessory
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
										let bridgeAccessory=this.createBridgeAccessory(newDevice,uuid)
										let bridgeService=bridgeAccessory.getService(Service.Tunnel)
										bridgeService=this.createBridgeService(newDevice,this.meshNetwork,false)
										this.configureBridgeService(bridgeService)

										//set current device status 
										bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)	
										
										if(this.showBridge){
											bridgeAccessory.addService(bridgeService)
											this.accessories[uuid]=bridgeAccessory                     
											this.log.info('Adding Gen-1 Bridge')
											this.log.debug('Registering platform accessory')
											this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
										}
										else{
											this.log.info('Skipping Bridge')
											}
									}).catch(err=>{this.log.error('Failed to add bridge %s', err)})
								break
								case "BH1G2-0001":
									// Create and configure Gen2 Bridge Service
									this.orbitapi.getNetworkTopologies(this.token,newDevice.network_topology_id).then(response=>{
										this.networkTopology=response.data
										this.log.debug('Creating and configuring new bridge')                       
										let bridgeAccessory=this.createBridgeAccessory(newDevice,uuid)
										let bridgeService=bridgeAccessory.getService(Service.Tunnel)
										bridgeService=this.createBridgeService(newDevice,this.networkTopology,true)
										this.configureBridgeService(bridgeService)

										//set current device status 
										bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)	
										
										if(this.showBridge){
											bridgeAccessory.addService(bridgeService)
											this.accessories[uuid]=bridgeAccessory                     
											this.log.info('Adding Gen-2 Bridge')
											this.log.debug('Registering platform accessory')
											this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
										}
										else{
											this.log.info('Skipping Bridge')
											}
									}).catch(err=>{this.log.error('Failed to add bridge %s', err)})
										break
									}
            break
						case "flood_sensor":
							this.log.debug('Adding Flood Sensor Device')
							this.log.debug('Found device %s',newDevice.name) 				
							//Remove cached accessory
							this.log.debug('Removed cached device')
							let FSAccessory
							if(this.accessories[uuid]){
								this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
								delete this.accessories[uuid]
							}

							if(this.showFloodSensor || this.showTempSensor)
								{FSAccessory=this.createFloodAccessory(newDevice,uuid)
								this.log.info('Adding Battery status for %s %s',newDevice.location_name, newDevice.name)
								let batteryStatus=this.createBatteryService(newDevice)
								this.configureBatteryService(batteryStatus)
								FSAccessory.getService(Service.Battery)
								FSAccessory.addService(batteryStatus)
								this.accessories[uuid]=FSAccessory                     					
								this.log.debug('Registering platform accessory')
								this.api.registerPlatformAccessories(PluginName, PlatformName, [FSAccessory])
								}

							if(this.showFloodSensor){
								this.log.info('Adding Flood Sensor for %s %s',newDevice.location_name, newDevice.name)				
								let leakSensor=this.createLeakService(newDevice)
								this.configureLeakService(leakSensor)
								FSAccessory.getService(Service.LeakSensor)
								FSAccessory.addService(leakSensor)
							}
							if(this.showTempSensor){
								this.log.info('Adding Temperature Sensor for %s %s',newDevice.location_name, newDevice.name)
								let tempSensor=this.createTempService(newDevice)
								this.configureTempService(tempSensor)
								FSAccessory.getService(Service.TemperatureSensor)
								FSAccessory.addService(tempSensor)
								if(this.showLimitsSensor){
									let occupancySensor=this.createOccupancyService(newDevice)
									this.configureOccupancyService(occupancySensor)
									FSAccessory.getService(Service.OccupancySensor)
									FSAccessory.addService(occupancySensor)
								}
							}
						break
						default:
							// do nothing
					}

          this.log.debug('establish connection for %s',newDevice.name)
          this.orbitapi.openConnection(this.token, newDevice)
          this.orbitapi.onMessage(this.token, newDevice, this.updateService.bind(this))
          // Send Sync after 2 sec delay, match state to bhyve state 
          setTimeout(()=>{ 
            this.orbitapi.sync(this.token, newDevice)
          }, 2000)
        })
      }).catch(err=>{this.log.error('Failed to get token', err)})
    }).catch(err=>{this.log.error('Failed to get info for build', err)})
  }

  //**
  //** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
  //**
  configureAccessory(accessory){
    // Added cached devices to the accessories arrary
    this.log.debug('Found cached accessory, configuring %s', accessory.displayName);
    this.accessories[accessory.UUID]=accessory;
  }

  createIrrigationAccessory(device,uuid){
    this.log.debug('Create Irrigation service %s %s',device.id,device.name)
    // Create new Irrigation System Service
    let newPlatformAccessory=new PlatformAccessory(device.name, uuid)
    newPlatformAccessory.addService(Service.IrrigationSystem, device.name)
    let irrigationSystemService=newPlatformAccessory.getService(Service.IrrigationSystem);
    // Check if the device is connected
    if(device.is_connected == true){
      irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    } else {
      this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',device.name,device.last_connected_at)
      irrigationSystemService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
    }
    // Create AccessoryInformation Service
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, "Orbit")
      .setCharacteristic(Characteristic.SerialNumber, device.mac_address)
      .setCharacteristic(Characteristic.Model, device.type)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
      .setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
    return newPlatformAccessory;
  }

  configureIrrigationService(device,irrigationSystemService){
    this.log.info('Configure Irrigation system for %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
    // Configure IrrigationSystem Service
    irrigationSystemService 
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
    irrigationSystemService
      .getCharacteristic(Characteristic.Active)
      .on('get',this.getDeviceValue.bind(this, irrigationSystemService, "DeviceActive"))
    irrigationSystemService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceInUse"))
    irrigationSystemService
      .getCharacteristic(Characteristic.ProgramMode)
      .on('get', this.getDeviceValue.bind(this, irrigationSystemService, "DeviceProgramMode"))
  }

  getDeviceValue(irrigationSystemService, characteristicName, callback){
    //this.log.debug('%s - Set something %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value) 
    switch (characteristicName){
      case "DeviceActive":
        //this.log.debug("%s=%s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.Active).value);
        if(irrigationSystemService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.Active).value)
        }
      break    
      case "DeviceInUse":
        //this.log.debug("%s=%s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.InUse).value);
          callback(null, irrigationSystemService.getCharacteristic(Characteristic.InUse).value)
      break
      case "DeviceProgramMode":
        //this.log.debug("%s=%s %s", irrigationSystemService.getCharacteristic(Characteristic.Name).value, characteristicName,irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value);
        callback(null, irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).value)
      break
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName)
        callback()
      break
    }
  }
  
  createValveService(zone,manual_preset_runtime_sec){
    //Characteristic.ValveType.GENERIC_VALVE=0
    //Characteristic.ValveType.IRRIGATION=1
    //Characteristic.ValveType.SHOWER_HEAD=2
    //Characteristic.ValveType.WATER_FAUCET=3

    // Create Valve Service
    let valve=new Service.Valve(zone.name, zone.station)
		let defaultRuntime=this.defaultRuntime
		zone.enabled=true // need orbit version of enabled
		try{
			switch (this.runtimeSource) {
				case 0:
					defaultRuntime=this.defaultRuntime
				break
				case 1:
					if(manual_preset_runtime_sec>0){
						defaultRuntime=manual_preset_runtime_sec
					}
				break
				case 2:
					if(zone.flow_data.cycle_run_time_sec>0){
						defaultRuntime=zone.flow_data.cycle_run_time_sec
					}
				break
			}
		}catch(err){
			this.log.debug('error setting runtime, using default runtime')
			}
		this.log.debug("Created valve service for %s with id %s with %s min runtime", zone.name, zone.station, Math.round(defaultRuntime/60))
    valve.addCharacteristic(Characteristic.CurrentTime) // Use CurrentTime to store the run time ending
    valve.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
    valve.addCharacteristic(Characteristic.Model)
    valve.addCharacteristic(Characteristic.ConfiguredName)
    valve
      .setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.ValveType, this.displayValveType)
      .setCharacteristic(Characteristic.SetDuration, Math.ceil(defaultRuntime/60)*60)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.ServiceLabelIndex, zone.station)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.SerialNumber, UUIDGen.generate("zone-" + zone.station))
      .setCharacteristic(Characteristic.Name, zone.name)
      .setCharacteristic(Characteristic.ConfiguredName, zone.name)
      .setCharacteristic(Characteristic.Model, zone.sprinkler_type)
      if (zone.enabled){
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)}
      else{
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
      }  
    return valve
  }

  configureValveService(device, valveService){
    this.log.info("Configured zone-%s for %s with %s min runtime",valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, valveService.getCharacteristic(Characteristic.SetDuration).value/60)
		// Configure Valve Service
    valveService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getValveValue.bind(this, valveService, "ValveActive"))
      .on('set', this.setValveValue.bind(this, device, valveService));

    valveService
      .getCharacteristic(Characteristic.InUse)
      .on('get', this.getValveValue.bind(this, valveService, "ValveInUse"))
      .on('set', this.setValveValue.bind(this, device, valveService))

    valveService
      .getCharacteristic(Characteristic.SetDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveSetDuration"))
      .on('set', this.setValveSetDuration.bind(this, valveService, "ValveSetDuration"))

    valveService
      .getCharacteristic(Characteristic.RemainingDuration)
      .on('get', this.getValveValue.bind(this, valveService, "ValveRemainingDuration"))
  }

  createBatteryService(device){
    this.log.debug("create battery service for %s",device.name )
    // Create Battery Service
    let batteryStatus=new Service.Battery(device.name,device.id)
    batteryStatus
			.setCharacteristic(Characteristic.StatusLowBattery,Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			.setCharacteristic(Characteristic.BatteryLevel,device.battery.percent)
    return batteryStatus
  }
  
  configureBatteryService(batteryStatus){
    this.log.debug("configured battery service for %s",batteryStatus.getCharacteristic(Characteristic.Name).value)
    batteryStatus
			.getCharacteristic(Characteristic.StatusLowBattery)
			.on('get', this.getStatusLowBattery.bind(this,batteryStatus))
  }

  getStatusLowBattery(batteryStatus,callback){
  let batteryValue=batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value
	let currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
  if(batteryValue<=10){
    this.log.warn('Battery Status Low %s%',batteryValue)
		batteryStatus.setCharacteristic(Characteristic.StatusLowBattery,Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
		currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
		}
  callback(null,currentValue)
	}

	createFloodAccessory(device,uuid){
    this.log.debug('Create flood accessory %s %s',device.id,device.name)
    // Create new Bridge System Service
    let newPlatformAccessory=new PlatformAccessory(device.name, uuid)
    // Create AccessoryInformation Service
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, "Orbit")
      .setCharacteristic(Characteristic.SerialNumber, device.mac_address)
      .setCharacteristic(Characteristic.Model, device.type)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
      .setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
		newPlatformAccessory.getService(Service.AccessoryInformation)
			.getCharacteristic(Characteristic.Identify)
			.on('set', this.orbitapi.identify.bind(this.token,device))
    return newPlatformAccessory;
  }

	createLeakService(device){
		this.log.debug("create leak sensor for %s",device.name)
		// Create Leak Sensor Service
		let currentAlarm
		switch (device.status.flood_alarm_status){
			case 'ok':
				currentAlarm=false
			break
			case 'alarm':
				currentAlarm=true
			break
			default:
				currentAlarm=false
			break
			}
		let leakSensor=new Service.LeakSensor(device.name,device.id)
		leakSensor
			.setCharacteristic(Characteristic.LeakDetected,currentAlarm)
			.setCharacteristic(Characteristic.StatusActive,true)
			.setCharacteristic(Characteristic.StatusTampered,Characteristic.StatusTampered.NOT_TAMPERED)
		return leakSensor
	}

	configureLeakService(leakSensor){
		this.log.debug("configured leak sensor for %s",leakSensor.getCharacteristic(Characteristic.Name).value)
		leakSensor
			.getCharacteristic(Characteristic.LeakDetected)
			.on('get', this.getLeakStatus.bind(this,leakSensor))
	}

	getLeakStatus(leakSensor,callback){
	let leak=leakSensor.getCharacteristic(Characteristic.LeakDetected).value
	let currentValue = Characteristic.LeakDetected.LEAK_NOT_DETECTED
	if(leak){
		this.log.warn('%s, Leak Detected',leakSensor.getCharacteristic(Characteristic.Name).value)
		leakSensor.setCharacteristic(Characteristic.LeakDetected,Characteristic.LeakDetected.LEAK_DETECTED)
		currentValue = Characteristic.LeakDetected.LEAK_DETECTED
		}
	callback(null,currentValue)
	}

	createTempService(device){
		this.log.debug("create temperature sensor service for %s",device.name )
		// Create Leak Sensor Service
		let tempSensor=new Service.TemperatureSensor(device.name,'tempSensor')
		tempSensor
			.setCharacteristic(Characteristic.CurrentTemperature,(device.status.temp_f-32)*5/9)
			.setCharacteristic(Characteristic.StatusActive,true)
			.setCharacteristic(Characteristic.StatusTampered,Characteristic.StatusTampered.NOT_TAMPERED)
		return tempSensor
	}

	configureTempService(tempSensor){
		this.log.debug("configured temp sensor for %s",tempSensor.getCharacteristic(Characteristic.Name).value)
		tempSensor
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getTempStatus.bind(this,tempSensor))
	}
	getTempStatus(tempSensor,callback){
		let temp=tempSensor.getCharacteristic(Characteristic.CurrentTemperature).value
		let currentValue=temp
		//this.log.warn('Temp Detected',Math.round((temp*9/5)+32))
		callback(null,currentValue)
		}

	createOccupancyService(device){
		this.log.debug("create Occupancy service for %s",device.name )
		// Create Occupancy Service
		let occupancyStatus=new Service.OccupancySensor(device.name+' Temp Limits',device.id)
		occupancyStatus
			.setCharacteristic(Characteristic.OccupancyDetected,Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
		return occupancyStatus
	}
	
	configureOccupancyService(occupancyStatus){
		this.log.debug("configured Occupancy service") // for %s",occupancyStatus.getCharacteristic(Characteristic.Name).value)
		occupancyStatus
			.getCharacteristic(Characteristic.OccupancyDetected)
			.on('get', this.getStatusOccupancy.bind(this,occupancyStatus))
	}

	getStatusOccupancy(OccupancySensor,callback){
		let alarm=OccupancySensor.getCharacteristic(Characteristic.OccupancyDetected).value
		let currentValue=Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
		if(alarm){
			this.log.warn('%s, Alarm Detected',OccupancySensor.getCharacteristic(Characteristic.Name).value)
			this.log.warn('Temperture limits for %s exceeded',OccupancySensor.getCharacteristic(Characteristic.Name).value)
			currentValue=Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
		}
	callback(null,currentValue)
	}

  createBridgeAccessory(device,uuid){
    this.log.debug('Create Bridge service %s %s',device.id,device.name)
    // Create new Bridge System Service
    let newPlatformAccessory=new PlatformAccessory(device.name, uuid)
    // Create AccessoryInformation Service
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, "Orbit")
      .setCharacteristic(Characteristic.SerialNumber, device.mac_address)
      .setCharacteristic(Characteristic.Model, device.type)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
      .setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
    return newPlatformAccessory;
  }
  
  createBridgeService(device,network,G2){
    this.log.debug("create bridge service for %s",device.name )
    // Create Bridge Service
		let bridgeService=new Service.Tunnel(device.name,device.id)
    if(G2){
			bridgeService
			.setCharacteristic(Characteristic.AccessoryIdentifier,network.network_key)
			.setCharacteristic(Characteristic.TunneledAccessoryAdvertising,true)
			.setCharacteristic(Characteristic.TunneledAccessoryConnected,true)
			.setCharacteristic(Characteristic.TunneledAccessoryStateNumber,Object.keys(network.devices).length)
		}
		else{
		bridgeService
		.setCharacteristic(Characteristic.AccessoryIdentifier,network.ble_network_key)
		.setCharacteristic(Characteristic.TunneledAccessoryAdvertising,true)
		.setCharacteristic(Characteristic.TunneledAccessoryConnected,true)
		.setCharacteristic(Characteristic.TunneledAccessoryStateNumber,Object.keys(network.devices).length-1)
		}
    return bridgeService
  }

  configureBridgeService(bridgeService){
    this.log.debug("configured bridge for %s",bridgeService.getCharacteristic(Characteristic.Name).value)
    bridgeService
    .getCharacteristic(Characteristic.TunneledAccessoryConnected)
  }

  getValveValue(valveService, characteristicName, callback){
    //this.log.debug("getValue", valveService.getCharacteristic(Characteristic.Name).value, characteristicName);
    switch (characteristicName){
      case "ValveActive":
        //this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
        if(valveService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          callback(null, valveService.getCharacteristic(Characteristic.Active).value)
        }
      break
      case "ValveInUse":
      //this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
        callback(null, valveService.getCharacteristic(Characteristic.InUse).value);
      break
      case "ValveSetDuration":
      //this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
        callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
      break
      case "ValveRemainingDuration":
        // Calc remain duration
        let timeEnding=Date.parse(valveService.getCharacteristic(Characteristic.CurrentTime).value)
        let timeNow=Date.now();
        let timeRemaining=Math.max(Math.round((timeEnding - timeNow) / 1000), 0)
        if(isNaN(timeRemaining)){
          timeRemaining=0
        }
        valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
        //this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,timeRemaining)
        callback(null, timeRemaining)
      break
      default:
        this.log.debug("Unknown CharacteristicName called", characteristicName);
        callback()
      break
    }
  }

  setValveValue(device, valveService, value, callback){
   //this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value) 
   let uuid=UUIDGen.generate(device.id)
   let irrigationAccessory=this.accessories[uuid]
   let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)

    // Set homekit state and prepare message for Orbit API
    let runTime=valveService.getCharacteristic(Characteristic.SetDuration).value
    if(value == Characteristic.Active.ACTIVE){
      // Turn on/idle the valve
      this.log.info("Starting zone-%s %s for %s mins", valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, runTime/60)
      let station=valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value
      this.orbitapi.startZone(this.token, device, station, runTime/60)
      irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.ACTIVE)
      valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
      //json start stuff
      let myJsonStart={
        source: "local",
        event: 'watering_in_progress_notification',
        program: 'manual',
        current_station: valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value,
        run_time: runTime/60,
        started_watering_station_at: new Date().toISOString(),
        rain_sensor_hold: false,
        device_id: device.id,
        timestamp: new Date().toISOString()
        }
      let myJsonStop={ 
        source: "local",
        timestamp: new Date().toISOString(),
        event: 'watering_complete',
        device_id: device.id
        } 
      this.log.debug(myJsonStart)
      this.log.debug('Simulating websocket event for %s will update services',myJsonStart.device_id)
      this.updateService(JSON.stringify(myJsonStart))
      this.fakeWebsocket=setTimeout(()=>{
        this.log.debug('Simulating websocket event for %s will update services',myJsonStop.device_id) 
        this.log.debug(myJsonStop)
        this.updateService(JSON.stringify(myJsonStop))
        }, runTime*1000) 
    } 
    else {
      // Turn off/stopping the valve
      this.log.info("Stopping Zone", valveService.getCharacteristic(Characteristic.Name).value)
      this.orbitapi.stopZone(this.token, device,)
      irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.INACTIVE)
      valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
      //json stop stuff
      let myJsonStop={ 
        source: "local",
        timestamp: new Date().toISOString(),
        event: 'watering_complete',
        device_id: device.id
        } 
      this.log.debug(myJsonStop)
      this.log.debug('Simulating websocket event for %s will update services',myJsonStop.device_id)
      this.updateService(JSON.stringify(myJsonStop))
      clearTimeout(this.fakeWebsocket)
    }
  callback()
  }

  setValveSetDuration(valveService, CharacteristicName, value, callback){
    // Set default duration from Homekit value 
    valveService.getCharacteristic(Characteristic.SetDuration).updateValue(value) 
    this.log.info("Set %s duration for %s mins", valveService.getCharacteristic(Characteristic.Name).value,value/60)
    callback()
  }

  createScheduleSwitchService(schedule){
    // Create Valve Service
    this.log.debug("Created service for %s with id %s and program %s", schedule.name, schedule.id, schedule.program);
    let switchService=new Service.Switch(schedule.name, schedule.program) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService.addCharacteristic(Characteristic.SerialNumber)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, schedule)
      .setCharacteristic(Characteristic.SerialNumber, schedule.id)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    return switchService
  }

  createSwitchService(device,switchType){
    // Create Valve Service
    this.log.debug('adding new switch')
    let uuid=this.api.hap.uuid.generate(device.id+switchType)
    let switchService=new Service.Switch(device.name+switchType, uuid) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, device.name+switchType)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
    return switchService
  }

  configureSwitchService(device, switchService){
    // Configure Valve Service
    this.log.info("Configured switch for %s" ,switchService.getCharacteristic(Characteristic.Name).value)
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchValue.bind(this, switchService))
      .on('set', this.setSwitchValue.bind(this, device, switchService))
  }

  setSwitchValue(device, switchService, value, callback){
    this.log.debug('toggle switch state %s',switchService.getCharacteristic(Characteristic.Name).value)
    switch(switchService.getCharacteristic(Characteristic.Name).value){
      case device.name+' Standby': 
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if(!value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.orbitapi.deviceStandby(this.token,device,'auto')
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.orbitapi.deviceStandby(this.token,device,'off')
          }
          callback()
        } 
      break
      case device.name+' Run All': 
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if(value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.orbitapi.startMultipleZone (this.token,device,this.defaultRuntime/60)
						this.log.info('Running all zones for %s min each',this.defaultRuntime/60)
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.orbitapi.stopDevice(this.token,device)
          }
          callback()
        }
        break
        default:
        if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
          callback('error')
        }
        else{
          if(value){
            switchService.getCharacteristic(Characteristic.On).updateValue(true)
            this.orbitapi.startSchedule (this.token,device,switchService.subtype)
            //this.activeProgram=switchService.subtype
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.orbitapi.stopDevice(this.token,device)
          }
          callback()
        }
        break
      }
    }

  getSwitchValue(switchService, callback){
    //this.log.debug("%s=%s", switchService.getCharacteristic(Characteristic.Name).value,switchService.getCharacteristic(Characteristic.On))
    if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
      callback('error')
    }
    else{
      callback(null, switchService.getCharacteristic(Characteristic.On).value)
    }
  } 

  updateService(message){
    try{
      let jsonBody=JSON.parse(message)
      let deviceName=this.deviceGraph.devices.filter( result=>result.id == jsonBody.device_id)[0].name
      let eventType=this.deviceGraph.devices.filter( result=>result.id == jsonBody.device_id)[0].type
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
          let irrigationAccessory=this.accessories[uuid]
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
            this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',deviceName,jsonBody.timestamp)
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
      break
			case "bridge":
        let bridgeAccessory
        if(this.showBridge){
          bridgeAccessory=this.accessories[uuid] 
					activeService=bridgeAccessory.getServiceById(Service.Tunnel, jsonBody.device_id)
        }
        switch (jsonBody.event){   
          case "device_connected":
            this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
            if(this.showBridge){activeService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
          break
          case "device_disconnected":
            this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',deviceName,jsonBody.timestamp)
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
      case "flood_sensor":
        let FSAccessory
				let leakService
				let tempService
				let batteryService
				let occupancySensor
				//this.log.warn('message received: %s',jsonBody)
        if(this.showFloodSensor || this.showTempSensor){
          FSAccessory=this.accessories[uuid] 
          leakService=FSAccessory.getService(Service.LeakSensor)
					tempService=FSAccessory.getService(Service.TemperatureSensor)
					batteryService=FSAccessory.getService(Service.Battery)
					occupancySensor=FSAccessory.getService(Service.OccupancySensor)
					switch (jsonBody.event){   
						case "fs_status_update":
							this.log.info('%s status update at %s',deviceName,new Date(jsonBody.timestamp).toString())
							//batteryService.getCharacteristic(Characteristic.BatteryLevel).updateValue(10)
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
							}
						break
						case "device_connected":
							this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
							if(this.showFloodSensor){leakService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
							if(this.showTempSensor){tempService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT)}
						break
						case "device_disconnected":
							this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',deviceName,jsonBody.timestamp)
							if(this.showFloodSensor){leakService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)}
							if(this.showTempSensor){tempService.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT)}
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

module.exports=PlatformOrbit;