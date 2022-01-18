/* todo list
What to do with Bridge
Add simple Valve
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
    this.showIncomingMessages=false
    this.showOutgoingMessages=false
    this.lastMessage
    this.activeZone
    this.activeProgram
    this.meshNetwork
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
                this.log.info('Adding online %s device %s found at the configured location: %s',device.hardware_version,device.name,device.address.line_1)
              }
              else{
                this.log.info('Adding offline %s device %s found at the configured location: %s',device.hardware_version,device.name,device.address.line_1)
              }
              this.locationMatch=true
            }
            else{
              this.log.info('Skipping %s device %s at %s, not found at the configured location: %s',device.hardware_version,device.name,device.address.line_1,this.locationAddress)
              this.locationMatch=false
            }
            return this.locationMatch
          }).forEach((newDevice)=>{
            //adding devices that met filter criteria
            this.log.debug('Found device %s with status %s',newDevice.name,newDevice.status.run_mode)
            let uuid=UUIDGen.generate(newDevice.id)
            switch (newDevice.type){
              case "sprinkler_timer":
                this.log.debug('Adding Device Sprinkler Timer')
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
              //Remove cached accessory
              this.log.debug('Removed cached device')
              if(this.accessories[uuid]){
                this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                delete this.accessories[uuid]
              }
							if(this.showBridge){
								// Create and configure Bridge Service
								this.orbitapi.getMeshes(this.token,newDevice.mesh_id).then(response=>{
									this.meshNetwork=response.data
									this.log.debug('Creating and configuring new bridge')                       
									let bridgeAccessory=this.createBridgeAccessory(newDevice,uuid)
									let bridgeService=bridgeAccessory.getService(Service.Tunnel)
									bridgeService=this.createBridgeService(newDevice,this.meshNetwork)
									this.configureBridgeService(bridgeService)

									//set current device status 
									bridgeService.getCharacteristic(Characteristic.StatusFault).updateValue(!newDevice.is_connected)	

									bridgeAccessory.addService(bridgeService)
									this.accessories[uuid]=bridgeAccessory                     
									this.log.info('Adding Bridge')
									this.log.debug('Registering platform accessory')
									this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
								}).catch(err=>{this.log.error('Failed to add bridge %s', err)})
							}
							else{
								this.log.info('Skipping Bridge')
								}
            break
          }
          if(newDevice.mesh_id){
            this.orbitapi.getMeshes(this.token,newDevice.mesh_id).then(response=>{
              this.log.debug('Found mesh netowrk for',response.data.name)
              this.meshNetwork=response.data
            }).catch(err=>{this.log.error('Failed to get mesh response %s', err)})
          }
          else{
            this.log.debug('Skipping Mesh info for %s with firmware %s',newDevice.hardware_version, newDevice.firmware_version)
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
    this.log('Found cached accessory, configuring %s', accessory.displayName);
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
  
  createBridgeService(device,mesh){
    this.log.debug("create bridge service for %s",device.name )
    // Create Bridge Service
    //let bridgeService=new Service.BridgeConfiguration(device.name,device.id) 
		let bridgeService=new Service.Tunnel(device.name,device.id)
    bridgeService
		.setCharacteristic(Characteristic.AccessoryIdentifier,mesh.name)
		.setCharacteristic(Characteristic.TunneledAccessoryAdvertising,true)
		.setCharacteristic(Characteristic.TunneledAccessoryConnected,true)
		.setCharacteristic(Characteristic.TunneledAccessoryStateNumber,Object.keys(mesh.devices).length)
    return bridgeService
  }

  configureBridgeService(bridgeService){
    this.log.debug("configured bridge for %s",bridgeService.getCharacteristic(Characteristic.Name).value)
    bridgeService
    .getCharacteristic(Characteristic.TunneledAccessoryConnected)
    //.on('get', this.somthing.bind(this,bridgeService))
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
            this.log.info('%s device disconnected',deviceName)
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
            this.log.warn('Unknown device message received: %s',jsonBody.event);
          break 
        }
      break
      case "bridge":
        let bridgeAccessory
        let bridgeService
        if(this.showBridge){
          bridgeAccessory=this.accessories[uuid] 
          bridgeService=bridgeAccessory.getService(Service.BridgeConfiguration)
        }
        switch (jsonBody.event){   
          case "device_connected":
            this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
            if(this.showBridge){bridgeService.getCharacteristic(Characteristic.DiscoverBridgedAccessories).updateValue(true)}
          break
          case "device_disconnected":
            this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',deviceName,jsonBody.timestamp)
            if(this.showBridge){bridgeService.getCharacteristic(Characteristic.DiscoverBridgedAccessories).updateValue(false)}
          break
          default:
            this.log.warn('Unknown bridge message received: %s',jsonBody.event);
          break 
          case "device_idle":
            //do nothing
          break
          case "change_mode":
            //do nothing
          break 
        }
      }
    return
    }catch(err){this.log.error('Error updating service %s', err)}
  }
}

module.exports=PlatformOrbit;