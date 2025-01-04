let packageJson = require('../package.json')
let OrbitAPI = require('../orbitapi')

class bridge {
	constructor(platform, log) {
		this.log = log
		this.platform = platform
		this.orbitapi = new OrbitAPI(this, log)
	}

	createBridgeAccessory(device, uuid, platformAccessory) {
		if (!platformAccessory) {
			this.log.debug('Create Bridge Accessory %s %s', device.id, device.name)
			platformAccessory = new PlatformAccessory(device.name, uuid)
			platformAccessory.addService(Service.IrrigationSystem, device.name) ///question this
		} else {
			this.log.debug('Update Bridge Accessory %s %s', device.id, device.name)
		}

		platformAccessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Name, device.name)
			.setCharacteristic(Characteristic.Manufacturer, 'Orbit Irrigation')
			.setCharacteristic(Characteristic.SerialNumber, device.mac_address)
			.setCharacteristic(Characteristic.Model, device.hardware_version)
			.setCharacteristic(Characteristic.Identify, true)
			.setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
			.setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
			.setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
		return platformAccessory
	}

	createBridgeService(device, network, G2) {
		this.log.debug('create bridge service for %s', device.name)
		let bridgeService = new Service.Tunnel(device.name, device.id)
		if (G2) {
			bridgeService
				.setCharacteristic(Characteristic.AccessoryIdentifier, network.network_key)
				.setCharacteristic(Characteristic.TunneledAccessoryAdvertising, true)
				.setCharacteristic(Characteristic.TunneledAccessoryConnected, true)
				.setCharacteristic(Characteristic.TunneledAccessoryStateNumber, Object.keys(network.devices).length)
		} else {
			bridgeService
				.setCharacteristic(Characteristic.AccessoryIdentifier, network.ble_network_key)
				.setCharacteristic(Characteristic.TunneledAccessoryAdvertising, true)
				.setCharacteristic(Characteristic.TunneledAccessoryConnected, true)
				.setCharacteristic(Characteristic.TunneledAccessoryStateNumber, Object.keys(network.devices).length - 1)
		}
		return bridgeService
	}

	configureBridgeService(bridgeService) {
		this.log.debug('configured bridge for %s', bridgeService.getCharacteristic(Characteristic.Name).value)
		bridgeService.getCharacteristic(Characteristic.TunneledAccessoryConnected)
	}
}
module.exports = bridge
