/* todo list
What to do with Bridge
Known issues 
Run multiple API does not work, even if run from hhyve site.
API does not return program end
*/

'use strict'
const packageJson=require('./package')
const OrbitAPI=require('./orbitapi.js')

class PlatformOrbit {

  constructor(log, config, api){
    this.orbitapi=new OrbitAPI(this,log)
    this.log=log
    this.config=config
    this.email=config.email
    this.password=config.password
    this.token
    this.useIrrigationDisplay=config.useIrrigationDisplay
    this.defaultRuntime=config.defaultRuntime*60
    this.showStandby=config.showStandby
    this.showRunall=config.showRunall
    this.showSchedules=config.showSchedules
    this.locationAddress=config.locationAddress
    this.locationMatch=true
    this.showBridge=config.showRunall
    this.showIncomingMessages=false
    this.lastMessage
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
    this.log.debug('Fetching build info...')
    this.log.info('Getting Account info...')
    let uuid
    // login to the API and get the token
    this.orbitapi.getToken(this.email,this.password).then(response=>{
      this.log.info('Found account for',response.data.user_name)
      this.log.debug('Found token',response.data.orbit_api_key)  
      this.token=response.data.orbit_api_key
        // get an array of the devices

        this.orbitapi.getDevices(this.token).then(response=>{
          response.data.filter((device)=>{
            if(!this.locationAddress || this.locationAddress==device.address.line_1){  
              this.log.info('Adding device %s found at the configured location: %s',device.name,device.address.line_1)
              this.locationMatch=true
            }
            else{
              this.log.info('Skipping device %s at %s, not found at the configured location: %s',device.name,device.address.line_1,this.locationAddress)
              this.locationMatch=false
            }
            return this.locationMatch
          }).forEach((newDevice)=>{
            switch (newDevice.type){
              case "sprinkler_timer":
                this.log.info('Adding Sprinkler Timer')
                // Generate irrigation service uuid
                uuid=UUIDGen.generate(newDevice.id)
                
                //Remove cached accessory
                this.log.debug('Removed cached device')
                if(this.accessories[uuid]){
                  this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                  delete this.accessories[uuid]
                }
                let switchService
                // Create and configure Irrigation Service
                this.log.debug('Creating and configuring new device')                
                let irrigationAccessory=this.createIrrigationAccessory(newDevice,uuid)
                this.configureIrrigationService(newDevice,irrigationAccessory.getService(Service.IrrigationSystem))
                
                // Create and configure Battery Service
                let batteryService=this.createBatteryService(newDevice)
                this.configureBatteryService(batteryService)
                irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(batteryService)
                irrigationAccessory.addService(batteryService)
                
                // Create and configure Values services and link to Irrigation Service
                newDevice.zones=newDevice.zones.sort(function (a, b){
                  return a.station - b.station
                })
                newDevice.zones.forEach((zone)=>{
                  if(!this.useIrrigationDisplay && !zone.enabled){// need orbit version of enabled
                    this.log.info('Skipping disabled zone %s',zone.name )
                  }
                  else {
                    this.log.debug('adding zone %s',zone.name )
                    let valveService=this.createValveService(newDevice)
                    this.configureValveService(newDevice, valveService)
                    if(this.useIrrigationDisplay){
                      this.log.debug('Using irrigation system')
                      irrigationAccessory.getService(Service.IrrigationSystem).addLinkedService(valveService) 
                    }
                    else{
                      this.log.debug('Using separate tiles')
                      irrigationAccessory.getService(Service.IrrigationSystem)
                    }
                    irrigationAccessory.addService(valveService)
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
                uuid=UUIDGen.generate(newDevice.id)
                //Remove cached accessory
                this.log.debug('Removed cached device')
                if(this.accessories[uuid]){
                  this.api.unregisterPlatformAccessories(PluginName, PlatformName, [this.accessories[uuid]])
                  //delete this.accessories[uuid]
                this.log.debug('Creating and configuring new bridge')
                
                // Create and configure Bridge Service
                let bridgeAccessory=this.createBridgeAccessory(newDevice,uuid)
                let bridgeService=bridgeAccessory.getService(Service.BridgeConfiguration)
                bridgeService=this.createBridgeService(newDevice)
                this.configureBridgeService(bridgeService)
                bridgeAccessory.addService(bridgeService)
                this.accessories[uuid]=bridgeAccessory                    
                if(this.showBridge){
                  this.log.info('Adding Bridge')
                  if(this.showRunall){
                    this.log.debug('adding new run all switch')
                    let switchService=this.createSwitchService(newDevice,' Run All')
                    this.configureSwitchService(newDevice, switchService)
                    bridgeAccessory.getService(Service.BridgeConfiguration).addLinkedService(switchService) 
                    bridgeAccessory.addService(switchService)
                    }
                  this.log.debug('Registering platform accessory')
                  this.api.registerPlatformAccessories(PluginName, PlatformName, [bridgeAccessory])
                }
                else{
                  this.log.info('Skipping Bridge')
                  //Remove cached accessory
                  }
                }
              this.orbitapi.getMeshes(this.token,newDevice.mesh_id).then(response=>{
                this.log.debug('Found mesh netowrk for',response.data.name)
                this.meshNetwork=response.data
              })
              this.orbitapi.getDeviceGraph(this.token,newDevice.user_id).then(response=>{
                this.log.debug('Found device graph for',response.data)
                this.deviceGraph=response.data
                this.setOnlineStatus(this.deviceGraph)
              })
              break
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
    this.log.info('Configure Irrigation service for %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
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
  
  createValveService(device){
    this.log.debug("Created service for %s with id %s", device.name, device.id)
    // Create Valve Service
    let valve=new Service.Valve(device.name, device.id)
    valve.addCharacteristic(Characteristic.CurrentTime) // Use CurrentTime to store the run time ending
    valve.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
    valve.addCharacteristic(Characteristic.Model)
    valve.addCharacteristic(Characteristic.ConfiguredName)
    //valve.getCharacteristic(Characteristic.SetDuration).setProps({minValue:60, maxValue:3600, minStep:1, validValues:[60,180,300,600,1200]})
    valve
      .setCharacteristic(Characteristic.Active, Characteristic.Active.INACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.ValveType, Characteristic.ValveType.IRRIGATION)
      .setCharacteristic(Characteristic.SetDuration, this.defaultRuntime)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.ServiceLabelIndex, device.station)
      .setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
      .setCharacteristic(Characteristic.SerialNumber, device.id)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.ConfiguredName, device.name)
      .setCharacteristic(Characteristic.Model, device.type)
      if(true==true){//(zone.enabled){ //faked out no disabled value
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)}
      else{
        valve.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.NOT_CONFIGURED)
      }  
    return valve
  }

  configureValveService(device, valveService){
    this.log.info("Configured zone-%s service for %s",valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value)
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
    let batteryService=new Service.Battery(device.name,device.id)
    batteryService
    .setCharacteristic(Characteristic.StatusLowBattery,Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
    .setCharacteristic(Characteristic.BatteryLevel,device.battery.percent)
    return batteryService
  }
  
  configureBatteryService(batteryService){
    this.log.debug("configure battery service for %s",batteryService.getCharacteristic(Characteristic.Name).value)
    batteryService
    .getCharacteristic(Characteristic.StatusLowBattery)
    .on('get', this.statusLowBattery.bind(this,batteryService))
  }

  statusLowBattery(batteryService,callback){
  let currentValue=batteryService.getCharacteristic(Characteristic.BatteryLevel).value
  if(currentValue<40){
    this.log.warn('Battery Status Low',currentValue)
    //batteryService.setCharacteristic(Characteristic.StatusLowBattery,Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
  }
  callback(currentValue)
}

  createBridgeAccessory(device,uuid){
    this.log.debug('Create Bridge service %s %s',device.id,device.name)
    // Create new Irrigation System Service
    let newPlatformAccessory=new PlatformAccessory(device.name, uuid)
    //newPlatformAccessory.addService(Service.BridgeConfiguration, device.name)
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
  createBridgeService(device){
    this.log.debug("create bridge service for %s",device.name )
    // Create Bridge Service
    let bridgeService=new Service.BridgeConfiguration(device.name,device.id)
    bridgeService
    .setCharacteristic(Characteristic.DiscoverBridgedAccessories,true)
    return bridgeService
  }

  configureBridgeService(bridgeService){
    this.log.debug("configure bridge service for %s",bridgeService.getCharacteristic(Characteristic.Name).value)
    bridgeService
    .getCharacteristic(Characteristic.ConfigureBridgedAccessoryStatus)
    //.on('get', this.somthing.bind(this,bridgeService))
  }

  getValveValue(valveService, characteristicName, callback){
    this.log.debug("getValue", valveService.getCharacteristic(Characteristic.Name).value, characteristicName);
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
      valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
      irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.ACTIVE)
      //json start stuff
      let myJsonStart={
        source: "local",
        event: 'watering_in_progress_notification',
        program: 'manual',
        current_station: device.station,
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
      valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
      irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.INACTIVE)
      //json stop stuff
      let myJsonStop={ 
        source: "local",
        timestamp: new Date().toISOString(),
        event: 'device_idle',
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
    this.log.debug("Created service for %s with id %s and program %s", schedule.name, schedule.id,schedule.program);
    let switchService=new Service.Switch(schedule.name, schedule.id) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService.addCharacteristic(Characteristic.SerialNumber)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, schedule)
      .setCharacteristic(Characteristic.SerialNumber, schedule.program+'-'+schedule.id)
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
    this.log.info("Configured service for %s" ,switchService.getCharacteristic(Characteristic.Name).value)
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
            this.orbitapi.startMultipleZone (this.token,this.meshNetwork,device,this.defaultRuntime/60)
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.orbitapi.stopDevice(this.token,this.meshNetwork.bridge_device_id)
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
            this.orbitapi.startSchedule (this.token,device,switchService.getCharacteristic(Characteristic.SerialNumber).value.substring(0,1))
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

  setOnlineStatus(graph){
    //set current device status  
    graph.devices.forEach((device)=>{
      if(device.type=="sprinkler_timer"){
        this.log.debug('device %s offline',device.name)
        let uuid=UUIDGen.generate(device.id)
        let irrigationAccessory=this.accessories[uuid]
        let service=irrigationAccessory.getServiceById(Service.Valve, device.id)
        service.getCharacteristic(Characteristic.StatusFault).updateValue(!device.is_connected)
      }
    }) 
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
          let switchService=irrigationAccessory.getServiceById(Service.Switch,UUIDGen.generate(jsonBody.device_id+' Standby'))  
        switch (jsonBody.event){        
          case "watering_in_progress_notification":
            if(jsonBody.source!='local'){this.log.info('Watering in progress device %s for %s mins',deviceName, Math.round(jsonBody.run_time))}
            activeService=irrigationAccessory.getServiceById(Service.Valve, jsonBody.device_id)
            if(activeService){
              activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
              activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.IN_USE)
              activeService.getCharacteristic(Characteristic.RemainingDuration).updateValue(jsonBody.run_time * 60)
              let endTime= new Date(Date.now() + parseInt(jsonBody.run_time) * 60 * 1000).toISOString()
              activeService.getCharacteristic(Characteristic.CurrentTime).updateValue(endTime)
            }
          break
          case "watering_complete":
            if(jsonBody.source!='local'){this.log.info('Device %s watering completed',deviceName)}
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
            activeService=irrigationAccessory.getServiceById(Service.Valve, jsonBody.device_id)
            if(activeService){
              activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE)
              activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
            }
          break
          case "device_idle":
            this.log.info('Device %s idle, watering stopped',deviceName)
            irrigationSystemService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
            activeService=irrigationAccessory.getServiceById(Service.Valve, jsonBody.device_id)
            if(activeService){
              activeService.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE)
              activeService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.InUse.NOT_IN_USE)
            }
          break
          case "change_mode":
            this.log.debug('%s mode changed to %s',deviceName,jsonBody.mode)
            switch (jsonBody.mode){
              case "auto":
                irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED)
                if(this.showStandby){switchService.getCharacteristic(Characteristic.On).updateValue(false)}
              break
              case "manual":
                irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE_)
                if(this.showStandby){switchService.getCharacteristic(Characteristic.On).updateValue(false)}
              break
              case "off":
                irrigationSystemService.getCharacteristic(Characteristic.ProgramMode).updateValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED)
                if(this.showStandby){switchService.getCharacteristic(Characteristic.On).updateValue(true)}
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
        let bridgeAccessory=this.accessories[uuid] 
        let bridgeService=bridgeAccessory.getService(Service.BridgeConfiguration)
        switch (jsonBody.event){   
          case "device_connected":
            this.log.info('%s connected at %s',deviceName,new Date(jsonBody.timestamp).toString())
            bridgeService.getCharacteristic(Characteristic.DiscoverBridgedAccessories).updateValue(true)
          break
          case "device_disconnected":
            this.log.warn('%s disconnected at %s This will show as non-responding in Homekit until the connection is restored',deviceName,jsonBody.timestamp)
            bridgeService.getCharacteristic(Characteristic.DiscoverBridgedAccessories).updateValue(false)
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
    }catch(err){
      If(eventType == undefined)
        {
          eventType=err
          this.log.warn(message)
        }
      this.log.error('Error updating service %s',eventType)
    }
    //}catch(err){this.log.error('Error updating service %s', eventType)}
    //}catch(err){this.log.error('Error updating service %s', err)}
  }
}

module.exports=PlatformOrbit;