let packageJson=require('../package.json')
let OrbitAPI=require('../orbitapi')

function irrigation (platform,log){
	this.log=log
  this.platform=platform
	this.orbitapi=new OrbitAPI(this,log)
}

irrigation.prototype={

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
      this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',device.name,device.last_connected_at)
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
  },

  configureIrrigationService(device,irrigationSystemService){
    this.log.info('Configure Irrigation system for %s', irrigationSystemService.getCharacteristic(Characteristic.Name).value)
    irrigationSystemService 
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
      .setCharacteristic(Characteristic.StatusFault, !device.is_connected)
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
  },

  createValveService(zone,device){
    let valve=new Service.Valve(zone.name, zone.station)
		let defaultRuntime=this.platform.defaultRuntime
		zone.enabled=true // need orbit version of enabled
		try{
			switch (this.platform.runtimeSource) {
				case 0:
					defaultRuntime=this.platform.defaultRuntime
				break
				case 1:
					if(device.manual_preset_runtime_sec>0){
						defaultRuntime=device.manual_preset_runtime_sec
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
      .setCharacteristic(Characteristic.ValveType, this.platform.displayValveType)
      .setCharacteristic(Characteristic.SetDuration, Math.ceil(defaultRuntime/60)*60)
      .setCharacteristic(Characteristic.RemainingDuration, 0)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.ServiceLabelIndex, zone.station)
      .setCharacteristic(Characteristic.StatusFault, !device.is_connected)
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
  },

  configureValveService(device, valveService){
    this.log.info("Configured zone-%s for %s with %s min runtime",valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, valveService.getCharacteristic(Characteristic.SetDuration).value/60)
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
  },

	createScheduleSwitchService(device,schedule){
    this.log.debug("Created service for %s with id %s and program %s", schedule.name, schedule.id, schedule.program);
    let switchService=new Service.Switch(schedule.name, schedule.program) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService.addCharacteristic(Characteristic.SerialNumber)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, schedule)
      .setCharacteristic(Characteristic.SerialNumber, schedule.id)
      .setCharacteristic(Characteristic.StatusFault, !device.is_connected)
    return switchService
  },

  createSwitchService(device,switchType){
    this.log.debug('adding new switch')
    let uuid=UUIDGen.generate(device.id+switchType)
    let switchService=new Service.Switch(device.name+switchType, uuid) 
    switchService.addCharacteristic(Characteristic.ConfiguredName)
    switchService 
      .setCharacteristic(Characteristic.On, false)
      .setCharacteristic(Characteristic.Name, device.name+switchType)
      .setCharacteristic(Characteristic.StatusFault, !device.is_connected)
    return switchService
  },

  configureSwitchService(device, switchService){
    this.log.info("Configured switch for %s" ,switchService.getCharacteristic(Characteristic.Name).value)
    switchService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getSwitchValue.bind(this, switchService))
      .on('set', this.setSwitchValue.bind(this, device, switchService))
  },
	
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
        this.log.debug("Unknown Device Characteristic Name called", characteristicName)
        callback()
      break
    }
  },

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
        this.log.debug("Unknown Valve Characteristic Name called", characteristicName);
        callback()
      break
    }
  },

  setValveValue(device, valveService, value, callback){
   //this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value) 
   let uuid=UUIDGen.generate(device.id)
   let irrigationAccessory=this.platform.accessories[uuid]
   let irrigationSystemService=irrigationAccessory.getService(Service.IrrigationSystem)
    // Set homekit state and prepare message for Orbit API
    let runTime=valveService.getCharacteristic(Characteristic.SetDuration).value
    if(value == Characteristic.Active.ACTIVE){
      // Turn on/idle the valve
      this.log.info("Starting zone-%s %s for %s mins", valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, runTime/60)
      let station=valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value
      this.orbitapi.startZone(this.platform.token, device, station, runTime/60)
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
      this.platform.updateService(JSON.stringify(myJsonStart))
      this.fakeWebsocket=setTimeout(()=>{
        this.log.debug('Simulating websocket event for %s will update services',myJsonStop.device_id) 
        this.log.debug(myJsonStop)
        this.platform.updateService(JSON.stringify(myJsonStop))
        }, runTime*1000) 
    } 
    else {
      // Turn off/stopping the valve
      this.log.info("Stopping Zone", valveService.getCharacteristic(Characteristic.Name).value)
      this.orbitapi.stopZone(this.platform.token, device,)
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
      this.platform.updateService(JSON.stringify(myJsonStop))
      clearTimeout(this.fakeWebsocket)
    }
  callback()
  },

  setValveSetDuration(valveService, CharacteristicName, value, callback){
    // Set default duration from Homekit value 
    valveService.getCharacteristic(Characteristic.SetDuration).updateValue(value) 
    this.log.info("Set %s duration for %s mins", valveService.getCharacteristic(Characteristic.Name).value,value/60)
    callback()
  },

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
            this.orbitapi.deviceStandby(this.platform.token,device,'auto')
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.orbitapi.deviceStandby(this.platfrom.token,device,'off')
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
            this.orbitapi.startMultipleZone (this.platform.token,device,this.platfrom.defaultRuntime/60)
						this.log.info('Running all zones for %s min each',this.platform.defaultRuntime/60)
          } 
          else {
            switchService.getCharacteristic(Characteristic.On).updateValue(false)
            this.orbitapi.stopDevice(this.platform.token,device)
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
					this.orbitapi.startSchedule (this.platform.token,device,switchService.subtype)
					//this.activeProgram=switchService.subtype
				} 
				else {
					switchService.getCharacteristic(Characteristic.On).updateValue(false)
					this.orbitapi.stopDevice(this.platform.token,device)
				}
				callback()
			}
			break
    }
  },

	getSwitchValue(switchService, callback){
		//this.log.debug("%s=%s", switchService.getCharacteristic(Characteristic.Name).value,switchService.getCharacteristic(Characteristic.On))
		if(switchService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			callback('error')
		}
		else{
			callback(null, switchService.getCharacteristic(Characteristic.On).value)
		}
	} 

}

module.exports = irrigation