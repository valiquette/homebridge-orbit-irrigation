let packageJson=require('../package.json')
let OrbitAPI=require('../orbitapi')

function sensor (platform,log){
	this.log=log
	this.platform=platform
	this.orbitapi=new OrbitAPI(this,log)
}

sensor.prototype={

	createFloodAccessory(device,uuid){
    this.log.debug('Create flood accessory %s %s',device.id, device.location_name+' '+device.name)
    let newPlatformAccessory=new PlatformAccessory(device.location_name+' '+device.name, uuid)
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.location_name+' '+device.name)
      .setCharacteristic(Characteristic.Manufacturer, "Orbit")
      .setCharacteristic(Characteristic.SerialNumber, device.mac_address)
      .setCharacteristic(Characteristic.Model, device.type)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
      .setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
		newPlatformAccessory.getService(Service.AccessoryInformation)
			.getCharacteristic(Characteristic.Identify)
			.on('set', this.orbitapi.identify.bind(this.platform.token,device))
    return newPlatformAccessory
  },

	createLeakService(device){
		this.log.debug("create leak sensor for %s",device.location_name+' '+device.name)
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
		let leakSensor=new Service.LeakSensor(device.location_name+' '+device.name,device.id)
		leakSensor
			.setCharacteristic(Characteristic.LeakDetected, currentAlarm)
			.setCharacteristic(Characteristic.StatusActive, true)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.StatusTampered, Characteristic.StatusTampered.NOT_TAMPERED)
		return leakSensor
	},

	configureLeakService(leakSensor){
		this.log.debug("configured leak sensor for %s",leakSensor.getCharacteristic(Characteristic.Name).value)
		leakSensor
			.getCharacteristic(Characteristic.LeakDetected)
			.on('get', this.getLeakStatus.bind(this, leakSensor))
	},

	createTempService(device){
		this.log.debug("create temperature sensor service for %s",device.location_name+' '+device.name )
		let tempSensor=new Service.TemperatureSensor(device.location_name+' '+device.name+' Temp','tempSensor')
		tempSensor
			.setCharacteristic(Characteristic.CurrentTemperature, (device.status.temp_f-32)*5/9)
			.setCharacteristic(Characteristic.StatusActive, true)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.StatusTampered, Characteristic.StatusTampered.NOT_TAMPERED)
		return tempSensor
	},

	configureTempService(tempSensor){
		this.log.debug("configured temp sensor for %s",tempSensor.getCharacteristic(Characteristic.Name).value)
		tempSensor
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getTempStatus.bind(this, tempSensor))
	},

	createOccupancyService(device){
		this.log.debug("create Occupancy service for %s",device.location_name+' '+device.name )
		let occupancyStatus=new Service.OccupancySensor(device.location_name+' '+device.name+' high/low',device.id)
		occupancyStatus
			.setCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
			.setCharacteristic(Characteristic.StatusActive, true)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.StatusTampered, Characteristic.StatusTampered.NOT_TAMPERED)
		return occupancyStatus
	},

	configureOccupancyService(occupancyStatus){
		this.log.debug("configured Occupancy service")
		occupancyStatus
			.getCharacteristic(Characteristic.OccupancyDetected)
			.on('get', this.getStatusOccupancy.bind(this, occupancyStatus))
	},

	getLeakStatus(leakSensor,callback){
		if(leakSensor.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			if(leakSensor.getCharacteristic(Characteristic.StatusActive).value==true){
			this.log.debug('%s, Fault Detected',leakSensor.getCharacteristic(Characteristic.Name).value)
			leakSensor.setCharacteristic(Characteristic.StatusActive, false)
			}
			callback('error')
		}
		else{
			leakSensor.setCharacteristic(Characteristic.StatusActive, true)
			let leak=leakSensor.getCharacteristic(Characteristic.LeakDetected).value
			let currentValue = Characteristic.LeakDetected.LEAK_NOT_DETECTED
			if(leak){
				this.log.warn('%s, Leak Detected',leakSensor.getCharacteristic(Characteristic.Name).value)
				leakSensor.setCharacteristic(Characteristic.LeakDetected,Characteristic.LeakDetected.LEAK_DETECTED)
				currentValue = Characteristic.LeakDetected.LEAK_DETECTED
			}
			callback(null,currentValue)
		}
	},

	getTempStatus(tempSensor,callback){
		if(tempSensor.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			if(tempSensor.getCharacteristic(Characteristic.StatusActive).value==true){
				this.log.debug('%s, Fault Detected',tempSensor.getCharacteristic(Characteristic.Name).value)
				tempSensor.setCharacteristic(Characteristic.StatusActive, false)
			}
			callback('error')
		}
		else{
			tempSensor.setCharacteristic(Characteristic.StatusActive, true)
			let temp=tempSensor.getCharacteristic(Characteristic.CurrentTemperature).value
			let currentValue=temp
			this.log.debug('Temp Detected',Math.round((temp*9/5)+32))
			callback(null,currentValue)
		}
	},

	getStatusOccupancy(OccupancySensor,callback){
		if(OccupancySensor.getCharacteristic(Characteristic.StatusFault).value==Characteristic.StatusFault.GENERAL_FAULT){
			if(OccupancySensor.getCharacteristic(Characteristic.StatusActive).value==true){
			this.log.debug('%s, Fault Detected',OccupancySensor.getCharacteristic(Characteristic.Name).value)
			OccupancySensor.setCharacteristic(Characteristic.StatusActive, false)
			}
			callback('error')
		}
		else{
			OccupancySensor.setCharacteristic(Characteristic.StatusActive, true)
			let alarm=OccupancySensor.getCharacteristic(Characteristic.OccupancyDetected).value
			let currentValue=Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
			if(alarm){
				this.log.warn('%s, Alarm Detected',OccupancySensor.getCharacteristic(Characteristic.Name).value)
				this.log.info('Temperture limits for %s exceeded',OccupancySensor.getCharacteristic(Characteristic.Name).value)
				currentValue=Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
			}
			callback(null,currentValue)
		}
	}
}

module.exports = sensor