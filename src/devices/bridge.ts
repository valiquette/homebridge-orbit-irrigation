/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlatformAccessory, Service, Characteristic } from 'homebridge';
import pkg from 'homebridge-orbit-irrigation/package.json' with { type: 'json' };
import OrbitPlatform from '../orbitplatform.js';

export default class bridge {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	constructor(
		private readonly platform: OrbitPlatform,
		private log = platform.log,
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	createBridgeAccessory(device: any, uuid: string, platformAccessory: PlatformAccessory) {
		if (!platformAccessory) {
			this.log.debug('Create Bridge Accessory %s %s', device.id, device.name);
			platformAccessory = new this.platform.api.platformAccessory(device.name, uuid);
		} else {
			this.log.debug('Update Bridge Accessory %s %s', device.id, device.name);
		}

		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, device.name)
			.setCharacteristic(this.Characteristic.Manufacturer, 'Orbit Irrigation')
			.setCharacteristic(this.Characteristic.SerialNumber, device.mac_address)
			.setCharacteristic(this.Characteristic.Model, device.hardware_version || 'Orbit Bridge')
			.setCharacteristic(this.Characteristic.Identify, true)
			.setCharacteristic(this.Characteristic.FirmwareRevision, device.firmware_version || 'unknown')
			.setCharacteristic(this.Characteristic.HardwareRevision, device.hardware_version || 'unknown')
			.setCharacteristic(this.Characteristic.SoftwareRevision, pkg.version);
		return platformAccessory;
	}

	createBridgeService(device: any, network: any, G2: any): Service {
		this.log.debug('create bridge service for %s', device.name);
		const bridgeService = new this.Service.WiFiTransport(device.name, device.id);
		if (G2) {
			bridgeService
				.setCharacteristic(this.Characteristic.AccessoryIdentifier, network.network_key);
			bridgeService.setCharacteristic(this.Characteristic.CurrentTransport, device.is_connected);
		} else {
			bridgeService
				.setCharacteristic(this.Characteristic.AccessoryIdentifier, network.ble_network_key);
			bridgeService.setCharacteristic(this.Characteristic.CurrentTransport, device.is_connected);

		}
		return bridgeService;
	}

	configureBridgeService(bridgeService: Service) {
		this.log.debug('configured bridge for %s', bridgeService.getCharacteristic(this.Characteristic.Name).value);
		bridgeService.getCharacteristic(this.Characteristic.CurrentTransport);
	}
}