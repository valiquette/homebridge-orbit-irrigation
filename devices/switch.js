let OrbitAPI = require('../orbitapi')

class basicSwitch {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.orbitapi = new OrbitAPI(this, log)
	}

	createScheduleSwitchService(device, schedule) {
		this.log.debug('Created service for %s with id %s and program %s', schedule.name, schedule.id, schedule.program)
		let uuid = UUIDGen.generate(device.id + schedule.program)
		let switchService = new Service.Switch(device.name + ' ' + schedule.name, uuid)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService.addCharacteristic(Characteristic.SerialNumber)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, device.name + ' ' + schedule.name)
			.setCharacteristic(Characteristic.ConfiguredName, schedule.name + ' ' + device.name)
			.setCharacteristic(Characteristic.SerialNumber, schedule.id)
			.setCharacteristic(Characteristic.ServiceLabelIndex, schedule.program.charCodeAt(0))
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
		return switchService
	}

	createSwitchService(device, switchType) {
		this.log.debug('adding new switch')
		let uuid = UUIDGen.generate(device.id + switchType)
		let switchService = new Service.Switch(device.name + ' ' + switchType, uuid)
		switchService.addCharacteristic(Characteristic.ConfiguredName)
		switchService
			.setCharacteristic(Characteristic.On, false)
			.setCharacteristic(Characteristic.Name, device.name + ' ' + switchType)
			.setCharacteristic(Characteristic.ConfiguredName, switchType + ' ' + device.name)
			.setCharacteristic(Characteristic.StatusFault, !device.is_connected)
		return switchService
	}

	configureSwitchService(device, switchService) {
		this.log.info('Configured switch for program %s %s', switchService.subtype, switchService.getCharacteristic(Characteristic.Name).value)
		switchService.getCharacteristic(Characteristic.On)
		.on('get', this.getSwitchValue.bind(this, switchService))
		.on('set', this.setSwitchValue.bind(this, device, switchService))
	}

	setSwitchValue(device, switchService, value, callback) {
		this.log.debug('toggle switch state %s', switchService.getCharacteristic(Characteristic.Name).value)
		switch (switchService.getCharacteristic(Characteristic.Name).value) {
			case device.name + ' ' + 'Standby':
				if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				} else {
					if (!value) {
						switchService.getCharacteristic(Characteristic.On).updateValue(true)
						this.orbitapi.deviceStandby(device, 'auto')
					} else {
						switchService.getCharacteristic(Characteristic.On).updateValue(false)
						this.orbitapi.deviceStandby(device, 'off')
					}
					callback()
				}
				break
			case device.name + ' ' + 'Run All':
				if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				} else {
					if (value) {
						switchService.getCharacteristic(Characteristic.On).updateValue(true)
						this.orbitapi.startMultipleZone(device, this.platform.defaultRuntime / 60)
						this.log.info('Running all zones for %s min each', this.platform.defaultRuntime / 60)
					} else {
						switchService.getCharacteristic(Characteristic.On).updateValue(false)
						this.orbitapi.stopDevice(device)
					}
					callback()
				}
				break
			default:
				if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
					callback('error')
				} else {
					if (value) {
						switchService.getCharacteristic(Characteristic.On).updateValue(true)
						let program = String.fromCharCode(switchService.getCharacteristic(Characteristic.ServiceLabelIndex).value)
						this.orbitapi.startSchedule(device, program)
					} else {
						switchService.getCharacteristic(Characteristic.On).updateValue(false)
						this.orbitapi.stopDevice(device)
					}
					callback()
				}
				break
		}
	}

	getSwitchValue(switchService, callback) {
		if (switchService.getCharacteristic(Characteristic.StatusFault).value == Characteristic.StatusFault.GENERAL_FAULT) {
			callback('error')
		} else {
			callback(null, switchService.getCharacteristic(Characteristic.On).value)
		}
	}
}
module.exports = basicSwitch
