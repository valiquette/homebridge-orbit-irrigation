/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlatformAccessory, Service, Characteristic } from 'homebridge';
import pkg from 'homebridge-orbit-irrigation/package.json' with { type: 'json' };
import OrbitAPI from '../orbitapi.js';
import OrbitPlatform from '../orbitplatform.js';


export default class valve {
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

	createValveAccessory(device: any, zone: any, uuid: string, platformAccessory: PlatformAccessory) {
		let valveService;
		if (!device.name) {
			this.log.warn('device with no name, assign a name to this device in the B-Hyve app');
			device.name = 'Unnamed-' + device.id.substring(20); //my need to remove -
		}
		if (!zone.name) {
			this.log.warn('zone with no name, using device name. assign a name to this zone in the B-Hyve app');
			zone.name = device.name + ' zone-' + zone.station; //may need to remove -
		}
		if (!platformAccessory) {
			// Create new Valve System Service
			this.log.info('Create valve accessory %s station-%s %s', device.name, zone.station, zone.name);
			platformAccessory = new this.platform.api.platformAccessory(zone.name, uuid);
			valveService = platformAccessory.addService(this.Service.Valve, zone.station);
			//valveService = new this.Service.Valve(zone.name, zone.station)
			valveService.addCharacteristic(this.Characteristic.SerialNumber); //Use Serial Number to store the zone id
			valveService.addCharacteristic(this.Characteristic.Model);
			valveService.addCharacteristic(this.Characteristic.ConfiguredName);
			valveService.addCharacteristic(this.Characteristic.ProgramMode);
		} else {
			// Update Valve System Service
			this.log.debug('Update valve accessory %s station-%s %s', device.id, zone.station, device.name);
		}

		// Create AccessoryInformation Service
		platformAccessory.getService(this.Service.AccessoryInformation)!
			.setCharacteristic(this.Characteristic.Name, zone.name)
			.setCharacteristic(this.Characteristic.Manufacturer, 'Orbit Irrigation')
			.setCharacteristic(this.Characteristic.SerialNumber, device.mac_address)
			.setCharacteristic(this.Characteristic.Model, device.hardware_version || 'Orbit Valve')
			.setCharacteristic(this.Characteristic.Identify, true)
			.setCharacteristic(this.Characteristic.FirmwareRevision, device.firmware_version || 'unknown')
			.setCharacteristic(this.Characteristic.HardwareRevision, device.hardware_version || 'unknown')
			.setCharacteristic(this.Characteristic.SoftwareRevision, pkg.version)
			.setCharacteristic(this.Characteristic.ProductData, 'Valve');

		// Create Valve Service
		// Check if the device is connected
		valveService = platformAccessory.getService(this.Service.Valve)!;
		if (device.is_connected == true) {
			valveService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.NO_FAULT);
		} else {
			this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', device.name, device.last_connected_at);
			valveService.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
		}
		return platformAccessory;
	}

	updateValveService(device: any, zone: any, valve: any) {
		let defaultRuntime = this.platform.defaultRuntime;
		zone.enabled = true; // need orbit version of enabled
		this.log.debug(zone);
		try {
			switch (this.platform.runtimeSource) {
			case 0:
				defaultRuntime = this.platform.defaultRuntime;
				break;
			case 1:
				if (device.manual_preset_runtime_sec > 0) {
					defaultRuntime = device.manual_preset_runtime_sec;
				}
				break;
			case 2:
				if (zone.flow_data.cycle_run_time_sec > 0) {
					defaultRuntime = zone.flow_data.cycle_run_time_sec;
				}
				break;
			}
		} catch (err) {
			this.log.debug('error setting runtime, using default runtime');
		}
		this.log.debug('Created valve service for %s with zone-id %s with %s sec runtime (%s min)', zone.name, zone.station, defaultRuntime, Math.round(defaultRuntime / 60));
		valve
			.setCharacteristic(this.Characteristic.Active, this.Characteristic.Active.INACTIVE)
			.setCharacteristic(this.Characteristic.InUse, this.Characteristic.InUse.NOT_IN_USE)
			.setCharacteristic(this.Characteristic.ValveType, this.platform.displayValveType)
			.setCharacteristic(this.Characteristic.SetDuration, Math.ceil(defaultRuntime / 60) * 60)
			.setCharacteristic(this.Characteristic.RemainingDuration, 0)
			.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
			.setCharacteristic(this.Characteristic.ServiceLabelIndex, zone.station)
			.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected)
			.setCharacteristic(this.Characteristic.SerialNumber, this.platform.genUUID ('zone-' + zone.station))
			.setCharacteristic(this.Characteristic.Name, zone.name)
			.setCharacteristic(this.Characteristic.ConfiguredName, zone.name)
			.setCharacteristic(this.Characteristic.Model, zone.sprinkler_type ? zone.sprinkler_type : 'unknown');
		if (zone.enabled) {
			valve.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED);
		} else {
			valve.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.NOT_CONFIGURED);
		}
		return valve;
	}

	configureValveService(device: any, valveService: any) {
		this.log.info(
			'Configured zone-%s for %s with %s min runtime',
			valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
			valveService.getCharacteristic(this.Characteristic.Name).value,
			valveService.getCharacteristic(this.Characteristic.SetDuration).value / 60,
		);
		valveService.getCharacteristic(this.Characteristic.Active)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveActive'))
			.onSet(this.setValveValue.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.InUse)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveInUse'))
			.onSet(this.setValveValue.bind(this, device, valveService));
		valveService.getCharacteristic(this.Characteristic.SetDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveSetDuration'))
			.onSet(this.setValveSetDuration.bind(this, valveService));
		valveService.getCharacteristic(this.Characteristic.RemainingDuration)
			.onGet(this.getValveValue.bind(this, valveService, 'ValveRemainingDuration'));
	}

	async getValveValue(valveService: any, characteristicName: any) {
		//this.log.debug("value", valveService.getCharacteristic(this.Characteristic.Name).value, characteristicName)
		if (valveService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		let currentValue;
		switch (characteristicName) {
		case 'ValveActive':
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(this.Characteristic.Name).value, characteristicName,valveService.getCharacteristic(this.Characteristic.Active).value)
			currentValue = valveService.getCharacteristic(this.Characteristic.Active).value;
			break;
		case 'ValveInUse':
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(this.Characteristic.Name).value, characteristicName,valveService.getCharacteristic(this.Characteristic.Active).value)
			currentValue = valveService.getCharacteristic(this.Characteristic.InUse).value;
			break;
		case 'ValveSetDuration':
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(this.Characteristic.Name).value, characteristicName,valveService.getCharacteristic(this.Characteristic.Active).value)
			currentValue = valveService.getCharacteristic(this.Characteristic.SetDuration).value;
			break;
		case 'ValveRemainingDuration': {
			// Calc remain duration
			const timeEnding = Date.parse(this.platform.endTime[valveService.subtype]);
			const timeNow = Date.now();
			let timeRemaining = Math.max(Math.round((timeEnding - timeNow) / 1000), 0);
			if (isNaN(timeRemaining)) {
				timeRemaining = 0;
			}
			//this.log.debug("%s=%s %s", valveService.getCharacteristic(this.Characteristic.Name).value, characteristicName, timeRemaining)
			currentValue = timeRemaining;
			break;
		}
		default:
			this.log.debug('Unknown Valve Characteristic Name called', characteristicName);
			break;
		}
		return currentValue;
	}

	async setValveValue(device: any, valveService: any, value: any) {
		//this.log.debug('%s - Set Active state to %s', valveService.getCharacteristic(this.Characteristic.Name).value, value)
		if (valveService.getCharacteristic(this.Characteristic.StatusFault).value == this.Characteristic.StatusFault.GENERAL_FAULT) {
			throw new this.platform.HapStatusError(this.platform.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
		}
		if (value == valveService.getCharacteristic(this.Characteristic.Active).value) {
			//IOS 17 bug fix for duplicate calls
			this.log.debug('supressed duplicate call from IOS for %s, current value %s, new value %s', valveService.getCharacteristic(this.Characteristic.Name).value, value, valveService.getCharacteristic(this.Characteristic.Active).value);
			return;
		}
		const uuid = this.platform.genUUID (device.id);
		const valveAccessory = this.platform.accessories[uuid];
		// Set homekit state and prepare message for Orbit API
		const runTime = valveService.getCharacteristic(this.Characteristic.SetDuration).value;
		if (value == this.Characteristic.Active.ACTIVE) {
			// Turn on/idle the valve
			this.log.info('Starting zone-%s %s for %s mins', valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value, valveService.getCharacteristic(this.Characteristic.Name).value, runTime / 60);
			const station = valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value;
			this.orbitapi.startZone(this.platform.token, device, station, runTime / 60);
			valveService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.Active.ACTIVE);
			valveService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
			//json start stuff
			const myJsonStart = {
				source: 'local',
				current_station: valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
				water_event_queue: [
					{
						program: null,
						station: valveService.getCharacteristic(this.Characteristic.ServiceLabelIndex).value,
						run_time_sec: runTime,
					},
				],
				event: 'watering_in_progress_notification',
				status: 'watering_in_progress',
				rain_sensor_hold: false,
				device_id: device.id,
				timestamp: new Date().toISOString(),
				program: 'manual',
				started_watering_station_at: new Date().toISOString(),
				run_time: runTime / 60,
				total_run_time_sec: runTime,
			};
			const myJsonStop = {
				source: 'local',
				timestamp: new Date().toISOString(),
				event: 'watering_complete',
				'stream-id': '',
				'gateway-topic': 'devices-8',
				device_id: device.id,
			};

			this.log.debug('Simulating websocket event for %s', myJsonStart.device_id);
			if (this.platform.showIncomingMessages) {
				this.log.debug('simulated message', myJsonStart);
			}
			this.platform.eventMsg(JSON.stringify(myJsonStart));
			this.platform.fakeWebsocket = setTimeout(() => {
				this.log.debug('Simulating websocket event for %s', myJsonStop.device_id);
				if (this.platform.showIncomingMessages) {
					this.log.debug('simulated message', myJsonStop);
				}
				this.platform.eventMsg(JSON.stringify(myJsonStop));
			}, runTime * 1000);
		} else {
			// Turn off/stopping the valve
			this.log.info('Stopping Zone', valveService.getCharacteristic(this.Characteristic.Name).value);
			this.orbitapi.stopZone(this.platform.token, device);
			valveService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.Active.INACTIVE);
			valveService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
			//json stop stuff
			const myJsonStop = {
				source: 'local',
				timestamp: new Date().toISOString(),
				event: 'watering_complete',
				device_id: device.id,
			};
			this.log.debug('Simulating websocket event for %s', myJsonStop.device_id);
			if (this.platform.showIncomingMessages) {
				this.log.debug('simulated message', myJsonStop);
			}
			this.platform.eventMsg(JSON.stringify(myJsonStop));
			clearTimeout(this.platform.fakeWebsocket);
		}
		return;
	}

	async setValveSetDuration(valveService: any, value: any) {
		// Set default duration from Homekit value
		valveService.getCharacteristic(this.Characteristic.SetDuration).updateValue(value);
		this.log.info('Set %s duration for %s mins', valveService.getCharacteristic(this.Characteristic.Name).value, value / 60);
		return;
	}

	localMessage(listener: any ) {
		this.platform.eventMsg = (msg: any) => {
			listener(msg);
		};
	}
}