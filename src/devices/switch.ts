/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Service, Characteristic } from 'homebridge';
import OrbitAPI from '../orbitapi.js';
import OrbitPlatform from '../orbitplatform.js';

export default class basicSwitch {
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


	createScheduleSwitchService(device: any, schedule: any): Service {
		this.log.debug('Created service for %s with id %s and program %s', schedule.name, schedule.id, schedule.program);
		const uuid = this.platform.genUUID (device.id + schedule.program);
		const switchService = new this.Service.Switch(device.name + ' ' + schedule.name, uuid);
		switchService.addCharacteristic(this.Characteristic.ConfiguredName);
		switchService.addCharacteristic(this.Characteristic.SerialNumber);
		switchService.addCharacteristic(this.Characteristic.ServiceLabelIndex);
		switchService
			.setCharacteristic(this.Characteristic.On, false)
			.setCharacteristic(this.Characteristic.Name, device.name + ' ' + schedule.name)
			.setCharacteristic(this.Characteristic.ConfiguredName, schedule.name + ' ' + device.name)
			.setCharacteristic(this.Characteristic.SerialNumber, schedule.id)
			.setCharacteristic(this.Characteristic.ServiceLabelIndex, schedule.program.charCodeAt(0))
			.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected);
		return switchService;
	}

	createSwitchService(device: any, switchType: any): Service {
		this.log.debug('adding new switch');
		const uuid = this.platform.genUUID (device.id + switchType);
		const switchService = new this.Service.Switch(device.name + ' ' + switchType, uuid);
		switchService.addCharacteristic(this.Characteristic.ConfiguredName);
		switchService
			.setCharacteristic(this.Characteristic.On, false)
			.setCharacteristic(this.Characteristic.Name, device.name + ' ' + switchType)
			.setCharacteristic(this.Characteristic.ConfiguredName, switchType + ' ' + device.name)
			.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected);
		return switchService;
	}

	configureSwitchService(device: any, switchService: any) {
		if (switchService.subtype.length == 1) {
			this.log.info('Configured switch for program %s %s', switchService.subtype, switchService.getCharacteristic(this.Characteristic.Name).value);
		} else {
			this.log.info('Configured switch for %s', switchService.getCharacteristic(this.Characteristic.Name).value);
		}
		switchService.getCharacteristic(this.Characteristic.On)
			.onGet(this.getSwitchValue.bind(this, switchService))
			.onSet(this.setSwitchValue.bind(this, device, switchService));
	}

	async setSwitchValue(device: any, switchService: any, value: any) {
		if (switchService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		this.log.debug('toggle switch state %s', switchService.getCharacteristic(this.Characteristic.Name).value);
		switch (switchService.getCharacteristic(this.Characteristic.Name).value) {
		case device.name + ' ' + 'Standby':
			if (!value) {
				switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
				this.orbitapi.deviceStandby(this.platform.token, device, 'auto');
			} else {
				switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
				this.orbitapi.deviceStandby(this.platform.token, device, 'off');
			}
			break;
		case device.name + ' ' + 'Run All':
			if (value) {
				switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
				this.orbitapi.startMultipleZone(this.platform.token, device, this.platform.defaultRuntime / 60);
				this.log.info('Running all zones for %s min each', this.platform.defaultRuntime / 60);
			} else {
				switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
				this.orbitapi.stopDevice(this.platform.token, device);
			}
			break;
		default: // schedule programs
			if (value) {
				switchService.getCharacteristic(this.Characteristic.On).updateValue(true);
				const program = String.fromCharCode(switchService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value);
				this.orbitapi.startSchedule(this.platform.token, device, program);
			} else {
				switchService.getCharacteristic(this.Characteristic.On).updateValue(false);
				this.orbitapi.stopDevice(this.platform.token, device);
			}
			break;
		}
		return;
	}

	async getSwitchValue(switchService: any) {
		let currentValue;
		if (switchService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		} else {
			currentValue = switchService.getCharacteristic(this.Characteristic.On).value;
		}
		return currentValue;
	}
}