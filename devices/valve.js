let packageJson=require('../package.json')
let OrbitAPI=require('../orbitapi')

function valve (platform,log){
	this.log=log
	this.platform=platform
	this.orbitapi=new OrbitAPI(this,log)
}

valve.prototype={

	createValveAccessory(device,zone,uuid){
		this.log.debug('Create valve service %s station-%s %s',device.id,zone.station,device.name)
		// Create new valve System Service
		let newPlatformAccessory=new PlatformAccessory(zone.name, uuid)
		newPlatformAccessory.addService(Service.Valve, zone.name)
		let valveService=newPlatformAccessory.getService(Service.Valve)
		// Check if the device is connected
		if(device.is_connected == true){
			valveService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.NO_FAULT)
		} else{
		this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.',device.name,device.last_connected_at)
		valveService.setCharacteristic(Characteristic.StatusFault, Characteristic.StatusFault.GENERAL_FAULT)
		}
		// Create AccessoryInformation Service
		newPlatformAccessory.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Name, zone.name)
			.setCharacteristic(Characteristic.Manufacturer, "Orbit Irrigation")
			.setCharacteristic(Characteristic.SerialNumber, device.mac_address)
			.setCharacteristic(Characteristic.Model, device.hardware_version)
			.setCharacteristic(Characteristic.Identify, true)
			.setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
			.setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
			.setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
		return newPlatformAccessory
	},

	configureValveService(device,zone,valveService){
		this.log.info('Configure Valve system for %s', valveService.getCharacteristic(Characteristic.Name).value)
		valveService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.InUse, Characteristic.InUse.NOT_IN_USE)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.RemainingDuration, 0)
		valveService
			.getCharacteristic(Characteristic.Active)
			.on('get',this.getDeviceValue.bind(this, valveService, "DeviceActive"))
		valveService
			.getCharacteristic(Characteristic.InUse)
			.on('get', this.getDeviceValue.bind(this, valveService, "DeviceInUse"))
		valveService
			.getCharacteristic(Characteristic.ProgramMode)
			.on('get', this.getDeviceValue.bind(this, valveService, "DeviceProgramMode"))
	},

	updateValveService(device,zone,valve){
		let defaultRuntime=this.platform.defaultRuntime
		zone.enabled=true // need orbit version of enabled
		this.log.debug(zone)
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
		this.log.debug("Created valve service for %s with zone-id %s with %s sec runtime (%s min)", zone.name, zone.station,defaultRuntime, Math.round(defaultRuntime/60))
		valve.addCharacteristic(Characteristic.SerialNumber) //Use Serial Number to store the zone id
		valve.addCharacteristic(Characteristic.Model)
		valve.addCharacteristic(Characteristic.ConfiguredName)
		valve.addCharacteristic(Characteristic.ProgramMode)
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

	configureValveService(device,zone,valveService){
		this.log.info("Configured zone-%s for %s with %s min runtime",valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, valveService.getCharacteristic(Characteristic.SetDuration).value/60)
		valveService
			.getCharacteristic(Characteristic.Active)
			.on('get', this.getValveValue.bind(this, valveService, "ValveActive"))
			.on('set', this.setValveValue.bind(this, device, zone, valveService))

		valveService
			.getCharacteristic(Characteristic.InUse)
			.on('get', this.getValveValue.bind(this, valveService, "ValveInUse"))
			.on('set', this.setValveValue.bind(this, device, zone, valveService))

		valveService
			.getCharacteristic(Characteristic.SetDuration)
			.on('get', this.getValveValue.bind(this, valveService, "ValveSetDuration"))
			.on('set', this.setValveSetDuration.bind(this, valveService, "ValveSetDuration"))

		valveService
			.getCharacteristic(Characteristic.RemainingDuration)
			.on('get', this.getValveValue.bind(this, valveService, "ValveRemainingDuration"))
	},

	getDeviceValue(valveService, characteristicName, callback){
		//this.log.debug('%s - Set something %s', valveService.getCharacteristic(Characteristic.Name).value)
		switch (characteristicName){
		case "DeviceActive":
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
			if(valveService.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
				callback('error')
			}
			else{
				callback(null, valveService.getCharacteristic(Characteristic.Active).value)
			}
			break
		case "DeviceInUse":
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.InUse).value)
				callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
			break
		case "DeviceProgramMode":
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.ProgramMode).value)
			callback(null, valveService.getCharacteristic(Characteristic.ProgramMode).value)
			break
		default:
			this.log.debug("Unknown Device Characteristic Name called", characteristicName)
			callback()
			break
		}
	},

	getValveValue(valveService, characteristicName, callback){
		//this.log.debug("getValue", valveService.getCharacteristic(Characteristic.Name).value, characteristicName)
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
			callback(null, valveService.getCharacteristic(Characteristic.InUse).value)
			break
		case "ValveSetDuration":
		//this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,valveService.getCharacteristic(Characteristic.Active).value)
			callback(null, valveService.getCharacteristic(Characteristic.SetDuration).value)
			break
		case "ValveRemainingDuration":
			// Calc remain duration
				let timeEnding=Date.parse(this.platform.endTime[valveService.subtype])
			let timeNow=Date.now()
			let timeRemaining=Math.max(Math.round((timeEnding - timeNow) / 1000), 0)
			if(isNaN(timeRemaining)){
				timeRemaining=0
			}
			valveService.getCharacteristic(Characteristic.RemainingDuration).updateValue(timeRemaining)
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(Characteristic.Name).value, characteristicName,timeRemaining)
			callback(null, timeRemaining)
			break
		default:
			this.log.debug("Unknown Valve Characteristic Name called", characteristicName)
			callback()
			break
		}
	},

	setValveValue(device, zone, valveService, value, callback){
	//this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(Characteristic.Name).value, value)
	let uuid=UUIDGen.generate(device.id)
	let valveAccessory=this.platform.accessories[uuid]
	valveService=valveAccessory.getService(Service.Valve)
	// Set homekit state and prepare message for Orbit API
	let runTime=valveService.getCharacteristic(Characteristic.SetDuration).value
	if(value == Characteristic.Active.ACTIVE){
		// Turn on/idle the valve
		this.log.info("Starting zone-%s %s for %s mins", valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(Characteristic.Name).value, runTime/60)
		let station=valveService.getCharacteristic(Characteristic.ServiceLabelIndex).value
		this.orbitapi.startZone(this.platform.token, device, station, runTime/60)
		valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.ACTIVE)
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
		else{
		// Turn off/stopping the valve
		this.log.info("Stopping Zone", valveService.getCharacteristic(Characteristic.Name).value)
		this.orbitapi.stopZone(this.platform.token, device,)
		valveService.getCharacteristic(Characteristic.InUse).updateValue(Characteristic.Active.INACTIVE)
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
	}

}

module.exports = valve