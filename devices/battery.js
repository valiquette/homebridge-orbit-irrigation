let OrbitAPI = require('../orbitapi')

class battery {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.orbitapi = new OrbitAPI(this, log)
	}

	createBatteryService(device, uuid) {
		let batteryStatus
		if (device.location_name) {
			this.log.debug('create battery service for %s', device.location_name + ' ' + device.name)
			batteryStatus = new Service.Battery(device.location_name + ' ' + device.name, device.id)
		} else {
			this.log.debug('create battery service for %s', device.name)
			batteryStatus = new Service.Battery(device.name, device.id)
		}
		let percent = 100
		if (device.battery.percent) {
			percent = device.battery.percent
		} else if (device.battery.mv) {
			percent = ((jsonBody.mv-2000) / (3400-2000)) * 100 > 100 ? 100 : ((jsonBody.mv-2000) /(3400-2000)) * 100
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

	getStatusLowBattery(batteryStatus, callback) {
		let name = batteryStatus.getCharacteristic(Characteristic.Name).value
		let batteryValue = batteryStatus.getCharacteristic(Characteristic.BatteryLevel).value
		let currentValue = batteryStatus.getCharacteristic(Characteristic.StatusLowBattery).value
		if (batteryValue <= this.platform.lowBattery) {
			this.log.warn('%s Battery Status Low %s% Remaining', name, batteryValue)
			batteryStatus.setCharacteristic(Characteristic.StatusLowBattery, Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW)
			currentValue = Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
		}
		callback(null, currentValue)
	}
}
module.exports = battery
