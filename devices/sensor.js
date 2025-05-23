let packageJson = require('../package.json')
let OrbitAPI = require('../orbitapi')
let OrbitUpdate = require('../orbitupdate')

class sensor {
	constructor(platform, log, config) {
		this.log = log
		this.config = config
		this.platform = platform
		this.orbitapi = new OrbitAPI(this, log)
		this.orbit = new OrbitUpdate(this, log, config)
	}

	createFloodAccessory(device, uuid, platformAccessory) {
		if (!platformAccessory) {
			this.log.debug('Create flood accessory %s %s', device.id, device.location_name + ' ' + device.name)
			platformAccessory = new PlatformAccessory(device.location_name + ' ' + device.name, uuid)
		} else {
			this.log.debug('Update flood accessory %s %s', device.id, device.location_name + ' ' + device.name)
		}
		platformAccessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Name, device.location_name + ' ' + device.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Orbit Irrigation')
			.setCharacteristic(Characteristic.SerialNumber, device.mac_address)
			.setCharacteristic(Characteristic.Model, device.hardware_version)
			.setCharacteristic(Characteristic.Identify, true)
			.setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
			.setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
			.setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
		platformAccessory.getService(Service.AccessoryInformation).getCharacteristic(Characteristic.Identify).on('set', this.orbitapi.identify.bind(device))
		return platformAccessory
	}

	createBatteryService(device, uuid, platformAccessory) {
		let batteryStatus = platformAccessory.getService(Service.Battery)
		if (!batteryStatus) {
			if (device.location_name) {
				this.log.debug('create battery service for %s', device.location_name + ' ' + device.name)
				batteryStatus = new Service.Battery(device.location_name + ' ' + device.name, device.id)
			} else {
				this.log.debug('create battery service for %s', device.name)
				batteryStatus = new Service.Battery(device.name, device.id)
			}
		} else {
			if (device.location_name) {
				this.log.debug('update battery service for %s', device.location_name + ' ' + device.name)
			} else {
				this.log.debug('update battery service for %s', device.name)
			}
		}

		let percent = 100
		if (device.battery.percent) {
			percent = device.battery.percent
		}
		batteryStatus
			.setCharacteristic(Characteristic.ChargingState, Characteristic.ChargingState.NOT_CHARGEABLE)
			.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			.setCharacteristic(Characteristic.BatteryLevel, percent)
		return batteryStatus
	}

	configureBatteryService(batteryStatus) {
		this.log.debug('configured battery service for %s', batteryStatus.getCharacteristic(Characteristic.Name).value)
		batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).on('get', this.getStatusLowBattery.bind(this, batteryStatus))
	}

	createLeakService(device) {
		this.log.debug('create leak sensor for %s', device.location_name + ' ' + device.name)
		let currentAlarm
		switch (device.status.flood_alarm_status) {
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
		let leakSensor = new Service.LeakSensor(device.location_name + ' ' + device.name, device.id)
		leakSensor
			.setCharacteristic(Characteristic.StatusActive, true)
			.setCharacteristic(Characteristic.LeakDetected, currentAlarm)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.StatusTampered, Characteristic.StatusTampered.NOT_TAMPERED)
		return leakSensor
	}

	configureLeakService(leakSensor) {
		this.log.debug('configured leak sensor for %s', leakSensor.getCharacteristic(Characteristic.Name).value)
		leakSensor.getCharacteristic(Characteristic.LeakDetected).on('get', this.getLeakStatus.bind(this, leakSensor))
	}

	createTempService(device) {
		this.log.debug('create temperature sensor service for %s', device.location_name + ' ' + device.name)
		let tempSensor = new Service.TemperatureSensor(device.location_name + ' ' + device.name + ' Temp', 'tempSensor')
		tempSensor
			.setCharacteristic(Characteristic.StatusActive, true)
			.setCharacteristic(Characteristic.CurrentTemperature, ((device.status.temp_f - 32) * 5) / 9)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.StatusTampered, Characteristic.StatusTampered.NOT_TAMPERED)
		return tempSensor
	}

	configureTempService(tempSensor) {
		this.log.debug('configured temp sensor for %s', tempSensor.getCharacteristic(Characteristic.Name).value)
		tempSensor.getCharacteristic(Characteristic.CurrentTemperature).on('get', this.getTempStatus.bind(this, tempSensor))
	}

	createOccupancyService(device) {
		this.log.debug('create Occupancy service for %s', device.location_name + ' ' + device.name)
		let occupancyStatus = new Service.OccupancySensor(device.location_name + ' ' + device.name + ' Limits', device.id)
		occupancyStatus
			.setCharacteristic(Characteristic.StatusActive, true)
			.setCharacteristic(Characteristic.OccupancyDetected, Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(Characteristic.StatusTampered, Characteristic.StatusTampered.NOT_TAMPERED)
		return occupancyStatus
	}

	configureOccupancyService(occupancyStatus) {
		this.log.debug('configured Occupancy service')
		occupancyStatus.getCharacteristic(Characteristic.OccupancyDetected).on('get', this.getStatusOccupancy.bind(this, occupancyStatus))
	}

	async getStatusLowBattery(batteryStatus, callback) {
		let name = batteryStatus.getCharacteristic(Characteristic.Name).value
		let batteryValue = batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value
		let currentValue = batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value
		if (batteryValue <= this.platform.lowBattery) {
			this.log.warn('%s Battery Status Low %s% Remaining', name, batteryValue)
			batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
			currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
		}
		callback(null, currentValue)

		try {
			let sensorResponse = await this.orbitapi.getDevice(this.platform.token, batteryStatus.subtype).catch(err => {
				this.log.error('Failed to get device response %s', err)
			})
			this.log.debug('check sensor battery status %s %s', sensorResponse.location_name, sensorResponse.name)
			sensorResponse.device_id = sensorResponse.id
			sensorResponse.event = 'battery_status'
			this.orbit.updateService.bind(this.platform)(JSON.stringify(sensorResponse))
		} catch (err) {
			this.log.error('Failed to read sensor', err)
		}
	}

	getLeakStatus(leakSensor, callback) {
		if (leakSensor.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			if (leakSensor.getCharacteristic(Characteristic.StatusActive).value == true) {
				this.log.debug('%s, Fault Detected', leakSensor.getCharacteristic(Characteristic.Name).value)
				leakSensor.setCharacteristic(Characteristic.StatusActive, false)
			}
			callback('error')
		} else {
			leakSensor.setCharacteristic(Characteristic.StatusActive, true)
			let leak = leakSensor.getCharacteristic(Characteristic.LeakDetected).value
			let currentValue = Characteristic.LeakDetected.LEAK_NOT_DETECTED
			if (leak) {
				this.log.warn('%s, Leak Detected', leakSensor.getCharacteristic(Characteristic.Name).value)
				leakSensor.setCharacteristic(Characteristic.LeakDetected, Characteristic.LeakDetected.LEAK_DETECTED)
				currentValue = Characteristic.LeakDetected.LEAK_DETECTED
			}
			callback(null, currentValue)
		}
	}

	getTempStatus(tempSensor, callback) {
		if (tempSensor.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			if (tempSensor.getCharacteristic(Characteristic.StatusActive).value == true) {
				this.log.debug('%s, Fault Detected', tempSensor.getCharacteristic(Characteristic.Name).value)
				tempSensor.setCharacteristic(Characteristic.StatusActive, false)
			}
			callback('error')
		} else {
			tempSensor.setCharacteristic(Characteristic.StatusActive, true)
			let temp = tempSensor.getCharacteristic(Characteristic.CurrentTemperature).value
			let currentValue = temp
			if (this.platform.showExtraDebugMessages) {
				this.log.debug('Temp Detected', Math.round((temp * 9) / 5 + 32))
			}
			callback(null, currentValue)
		}
	}

	getStatusOccupancy(OccupancySensor, callback) {
		if (OccupancySensor.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			if (OccupancySensor.getCharacteristic(Characteristic.StatusActive).value == true) {
				this.log.debug('%s, Fault Detected', OccupancySensor.getCharacteristic(Characteristic.Name).value)
				OccupancySensor.setCharacteristic(Characteristic.StatusActive, false)
			}
			callback('error')
		} else {
			OccupancySensor.setCharacteristic(Characteristic.StatusActive, true)
			let alarm = OccupancySensor.getCharacteristic(Characteristic.OccupancyDetected).value
			let currentValue = Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED
			if (alarm) {
				this.log.warn('%s, Alarm Detected', OccupancySensor.getCharacteristic(Characteristic.Name).value)
				this.log.info('Temperture limits for %s exceeded', OccupancySensor.getCharacteristic(Characteristic.Name).value)
				currentValue = Characteristic.OccupancyDetected.OCCUPANCY_DETECTED
			}
			callback(null, currentValue)
		}
	}
}
module.exports = sensor
