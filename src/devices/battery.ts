/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Service, Characteristic } from 'homebridge';
import OrbitPlatform from '../orbitplatform.js';

export default class battery {
	public readonly Service!: typeof Service;
	public readonly Characteristic!: typeof Characteristic;
	constructor(
		private readonly platform: OrbitPlatform,

		private log = platform.log,
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	createBatteryService(device: any) {
		let batteryStatus: any;
		if (device.location_name) {
			this.log.debug('create battery service for %s', device.location_name + ' ' + device.name);
			batteryStatus = new this.Service.Battery(device.location_name + ' ' + device.name, device.id);
		} else {
			this.log.debug('create battery service for %s', device.name);
			batteryStatus = new this.Service.Battery(device.name, device.id);
		}
		let percent = 100;
		if (device.battery.percent) {
			percent = device.battery.percent;
		} else if (device.battery.mv) {
			percent = ((device.battery.mv - 2000) / (3400 - 2000)) * 100 > 100 ? 100 : ((device.battery.mv - 2000) / (3400 - 2000)) * 100;
		}
		batteryStatus
			.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
			.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			.setCharacteristic(this.Characteristic.BatteryLevel, percent);
		return batteryStatus;
	}

	configureBatteryService(batteryStatus: Service) {
		this.log.debug('configured battery service for %s', batteryStatus.getCharacteristic(this.Characteristic.Name).value);
		batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery).onGet(this.getStatusLowBattery.bind(this, batteryStatus));
	}

	async getStatusLowBattery(batteryStatus: Service) {
		const name = batteryStatus.getCharacteristic(this.Characteristic.Name).value;
		const batteryValue = batteryStatus.getCharacteristic(this.Characteristic.BatteryLevel).value;
		let currentValue = batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery).value;
		if (batteryValue! <= this.platform.lowBattery) {
			this.log.warn('%s Battery Status Low %s% Remaining', name, batteryValue);
			batteryStatus.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
			currentValue = this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
		}
		return currentValue;
	}
}