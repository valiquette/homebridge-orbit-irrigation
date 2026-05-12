/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlatformAccessory, Service, Characteristic } from 'homebridge';
import pkg from 'homebridge-orbit-irrigation/package.json' with { type: 'json' };
import OrbitAPI from '../orbitapi.js';
import OrbitPlatform from '../orbitplatform.js';

export default class sensor {
	public readonly Service: typeof Service;
	public readonly Characteristic: typeof Characteristic;
	constructor(
		private readonly platform: OrbitPlatform,
		private orbitapi = new OrbitAPI(platform),
		private log = platform.log,
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	createFloodAccessory(device: any, uuid: string, platformAccessory: PlatformAccessory) {
		if (!platformAccessory) {
			this.log.debug('Create flood accessory %s %s', device.id, device.location_name + ' ' + device.name);
			platformAccessory = new this.platform.api.platformAccessory(device.location_name + ' ' + device.name, uuid);
		} else {
			this.log.debug('Update flood accessory %s %s', device.id, device.location_name + ' ' + device.name);
		}
		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, device.location_name + ' ' + device.name)
			.setCharacteristic(this.Characteristic.Manufacturer, 'Orbit Irrigation')
			.setCharacteristic(this.Characteristic.SerialNumber, device.mac_address)
			.setCharacteristic(this.Characteristic.Model, device.hardware_version || 'Orbit Sensor')
			.setCharacteristic(this.Characteristic.Identify, true)
			.setCharacteristic(this.Characteristic.FirmwareRevision, device.firmware_version || 'unknown')
			.setCharacteristic(this.Characteristic.HardwareRevision, device.hardware_version || 'unknown')
			.setCharacteristic(this.Characteristic.SoftwareRevision, pkg.version);
		platformAccessory.getService(this.Service.AccessoryInformation)!.getCharacteristic(this.Characteristic.Identify)
			.onSet(this.orbitapi.identify.bind(device));
		return platformAccessory;
	}

	createBatteryService(device: any, platformAccessory: PlatformAccessory) {
		let batteryStatus: any = platformAccessory.getService(this.Service.Battery);
		if (!batteryStatus) {
			if (device.location_name) {
				this.log.debug('create battery service for %s', device.location_name + ' ' + device.name);
				batteryStatus = new this.Service.Battery(device.location_name + ' ' + device.name, device.id);
			} else {
				this.log.debug('create battery service for %s', device.name);
				batteryStatus = new this.Service.Battery(device.name, device.id);
			}
		} else {
			if (device.location_name) {
				this.log.debug('update battery service for %s', device.location_name + ' ' + device.name);
			} else {
				this.log.debug('update battery service for %s', device.name);
			}
		}

		let percent = 100;
		if (device.battery.percent) {
			percent = device.battery.percent;
		}
		batteryStatus
			.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
			.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
			.setCharacteristic(this.Characteristic.BatteryLevel, percent);
		return batteryStatus;
	}

	configureBatteryService(batteryStatus: Service) {
		this.log.debug('configured battery service for %s', batteryStatus.getCharacteristic(this.Characteristic.Name).value);
		batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery)
			.onGet(this.getStatusLowBattery.bind(this, batteryStatus));
	}

	createLeakService(device: any): Service {
		this.log.debug('create leak sensor for %s', device.location_name + ' ' + device.name);
		let currentAlarm;
		switch (device.status.flood_alarm_status) {
		case 'ok':
			currentAlarm = false;
			break;
		case 'alarm':
			currentAlarm = true;
			break;
		default:
			currentAlarm = false;
			break;
		}
		const leakSensor = new this.Service.LeakSensor(device.location_name + ' ' + device.name, device.id);
		leakSensor
			.setCharacteristic(this.Characteristic.StatusActive, true)
			.setCharacteristic(this.Characteristic.LeakDetected, currentAlarm)
			.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(this.Characteristic.StatusTampered, this.Characteristic.StatusTampered.NOT_TAMPERED);
		return leakSensor;
	}

	configureLeakService(leakSensor: Service) {
		this.log.debug('configured leak sensor for %s', leakSensor.getCharacteristic(this.Characteristic.Name).value);
		leakSensor.getCharacteristic(this.Characteristic.LeakDetected)
			.onGet(this.getLeakStatus.bind(this, leakSensor));
	}

	createTempService(device: any): Service {
		this.log.debug('create temperature sensor service for %s', device.location_name + ' ' + device.name);
		const tempSensor = new this.Service.TemperatureSensor(device.location_name + ' ' + device.name + ' Temp', 'tempSensor');
		tempSensor
			.setCharacteristic(this.Characteristic.StatusActive, true)
			.setCharacteristic(this.Characteristic.CurrentTemperature, ((device.status.temp_f - 32) * 5) / 9)
			.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(this.Characteristic.StatusTampered, this.Characteristic.StatusTampered.NOT_TAMPERED);
		return tempSensor;
	}

	configureTempService(tempSensor: Service) {
		this.log.debug('configured temp sensor for %s', tempSensor.getCharacteristic(this.Characteristic.Name).value);
		tempSensor.getCharacteristic(this.Characteristic.CurrentTemperature)
			.onGet(this.getTempStatus.bind(this, tempSensor));
	}

	createOccupancyService(device: any ): Service {
		this.log.debug('create Occupancy service for %s', device.location_name + ' ' + device.name);
		const occupancyStatus = new this.Service.OccupancySensor(device.location_name + ' ' + device.name + ' Limits', device.id);
		occupancyStatus
			.setCharacteristic(this.Characteristic.StatusActive, true)
			.setCharacteristic(this.Characteristic.OccupancyDetected, this.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED)
			.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(this.Characteristic.StatusTampered, this.Characteristic.StatusTampered.NOT_TAMPERED);
		return occupancyStatus;
	}

	configureOccupancyService(occupancyStatus: Service ) {
		this.log.debug('configured Occupancy service');
		occupancyStatus.getCharacteristic(this.Characteristic.OccupancyDetected)
			.onGet(this.getStatusOccupancy.bind(this, occupancyStatus));
	}

	async getStatusLowBattery(batteryStatus: any) {
		const name = batteryStatus.getCharacteristic(this.Characteristic.Name).value;
		const batteryValue = batteryStatus.getCharacteristic(this.Characteristic.BatteryLevel).value;
		let currentValue = batteryStatus.getCharacteristic(this.Characteristic.StatusLowBattery).value;
		if (batteryValue <= this.platform.lowBattery) {
			this.log.warn('%s Battery Status Low %s% Remaining', name, batteryValue);
			batteryStatus.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
			currentValue = this.platform.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
		}

		try {
			const sensorResponse = await this.orbitapi.getDevice(this.platform.token, batteryStatus.subtype).catch(err => {
				throw (err);
			});
			this.log.debug('check sensor battery status %s %s', sensorResponse.location_name, sensorResponse.name);
			sensorResponse.device_id = sensorResponse.id;
			sensorResponse.event = 'battery_status';
			this.platform.orbit.updateService.bind(this.platform)(JSON.stringify(sensorResponse));
		} catch (err) {
			this.log.warn('Failed to read sensor', err);
		}
		return currentValue;
	}

	async getLeakStatus(leakSensor: any) {
		if (leakSensor.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			if (leakSensor.getCharacteristic(this.Characteristic.StatusActive).value == true) {
				this.log.debug('%s, Fault Detected', leakSensor.getCharacteristic(this.Characteristic.Name).value);
				leakSensor.setCharacteristic(this.Characteristic.StatusActive, false);
			}
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		} else {
			leakSensor.setCharacteristic(this.Characteristic.StatusActive, true);
			const leak = leakSensor.getCharacteristic(this.Characteristic.LeakDetected).value;
			let currentValue = this.Characteristic.LeakDetected.LEAK_NOT_DETECTED;
			if (leak) {
				this.log.warn('%s, Leak Detected', leakSensor.getCharacteristic(this.Characteristic.Name).value);
				leakSensor.setCharacteristic(this.Characteristic.LeakDetected, this.Characteristic.LeakDetected.LEAK_DETECTED);
				currentValue = this.Characteristic.LeakDetected.LEAK_DETECTED;
			}
			return currentValue;
		}
	}

	async getTempStatus(tempSensor: any) {
		if (tempSensor.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			if (tempSensor.getCharacteristic(this.Characteristic.StatusActive).value == true) {
				this.log.debug('%s, Fault Detected', tempSensor.getCharacteristic(this.Characteristic.Name).value);
				tempSensor.setCharacteristic(this.Characteristic.StatusActive, false);
			}
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		} else {
			tempSensor.setCharacteristic(this.Characteristic.StatusActive, true);
			const temp = tempSensor.getCharacteristic(this.Characteristic.CurrentTemperature).value;
			const currentValue = temp;
			if (this.platform.showExtraDebugMessages) {
				this.log.debug('Temp Detected', Math.round((temp * 9) / 5 + 32));
			}
			return currentValue;
		}
	}

	async getStatusOccupancy(OccupancySensor: any) {
		if (OccupancySensor.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			if (OccupancySensor.getCharacteristic(this.Characteristic.StatusActive).value == true) {
				this.log.debug('%s, Fault Detected', OccupancySensor.getCharacteristic(this.Characteristic.Name).value);
				OccupancySensor.setCharacteristic(this.Characteristic.StatusActive, false);
			}
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		} else {
			OccupancySensor.setCharacteristic(this.Characteristic.StatusActive, true);
			const alarm = OccupancySensor.getCharacteristic(this.Characteristic.OccupancyDetected).value;
			let currentValue = this.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
			if (alarm) {
				this.log.warn('%s, Alarm Detected', OccupancySensor.getCharacteristic(this.Characteristic.Name).value);
				this.log.info('Temperture limits for %s exceeded', OccupancySensor.getCharacteristic(this.Characteristic.Name).value);
				currentValue = this.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED;
			}
			return currentValue;
		}
	}
}