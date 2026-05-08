/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-expressions */
'use strict';

import { API, Characteristic, DynamicPlatformPlugin, HAPStatus, HapStatusError, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import OrbitAPI from './orbitapi.js';
import OrbitUpdate from './orbitupdate.js';
import battery from './devices/battery.js';
import bridge from './devices/bridge.js';
import irrigation from './devices/irrigation.js';
import valve from './devices/valve.js';
import sensor from './devices/sensor.js';
import basicSwitch from './devices/switch.js';

export default class OrbitPlatform implements DynamicPlatformPlugin {
	[x: string]: any;
	public readonly Service!: typeof Service;
	public readonly Characteristic!: typeof Characteristic;
	public readonly HAPStatus!: typeof HAPStatus;
	public readonly HapStatusError!: typeof HapStatusError;
	public readonly accessories: PlatformAccessory[] = [];
	constructor(
		public readonly log: Logging,
		public readonly config: PlatformConfig,
		public readonly api: API,
	) {
		this.Service = api.hap.Service;
		this.Characteristic = api.hap.Characteristic;
		//this.HAPStatus = api.hap.HAPStatus;
		this.HapStatusError = api.hap.HapStatusError;
		this.platform = this;
		this.genUUID = api.hap.uuid.generate;

		this.orbitapi = new OrbitAPI(this.platform);
		this.orbit = new OrbitUpdate(this.platform);
		this.battery = new battery(this.platform);
		this.bridge = new bridge(this.platform);
		this.irrigation = new irrigation(this.platform);
		this.valve = new valve(this.platform);
		this.sensor = new sensor(this.platform);
		this.basicSwitch = new basicSwitch(this.platform);
		this.log = log;
		this.config = config;
		this.email = config.email;
		this.password = config.password;
		this.token;
		this.retryWait = config.retryWait ? config.retryWait : 60; //sec
		this.retryMax = config.retryMax ? config.retryMax : 3; //attempts
		this.retryAttempt = 0;
		this.userId;
		this.useIrrigationDisplay = config.useIrrigationDisplay;
		this.showSimpleValve = config.showSimpleValve ? config.showSimpleValve : false;
		this.displayValveType = config.displayValveType ? config.displayValveType : 0;
		this.defaultRuntime = config.defaultRuntime * 60;
		this.runtimeSource = config.runtimeSource;
		this.showStandby = config.showStandby;
		this.showRunall = config.showRunall;
		this.showSchedules = config.showSchedules;
		this.locationAddress = config.locationAddress;
		this.showIrrigation = config.showIrrigation;
		this.showBridge = config.showBridge;
		this.showFloodSensor = config.showFloodSensor;
		this.showTempSensor = config.showTempSensor;
		this.showLimitsSensor = config.showLimitsSensor;
		this.showAPIMessages = config.showAPIMessages ? config.showAPIMessages : false;
		this.showIncomingMessages = config.showIncomingMessages ? config.showIncomingMessages : false;
		this.showOutgoingMessages = config.showOutgoingMessages ? config.showOutgoingMessages : false;
		this.showExtraDebugMessages = config.showExtraDebugMessages ? config.showExtraDebugMessages : false;
		this.lowBattery = config.lowBattery ? config.lowBattery : 20;
		this.lastMessage = {};
		this.secondLastMessage = {};
		this.endTime = [];
		this.activeZone = [];
		this.activeProgram = false;
		this.meshNetwork;
		this.meshId;
		this.networkTopology;
		this.networkTopologyId;
		this.deviceGraph;
		this.accessories = [];

		if (!config.email || !config.password) {
			this.log.error('Valid email and password are required in order to communicate with the b-hyve, please check the plugin config');
		} else {
			this.log.info('Starting Orbit Platform using homebridge API', api.version);
		}
		//**
		//** Platforms should wait until the "didFinishLaunching" event has fired before registering any new accessories.
		//**


		api.on('didFinishLaunching', () => {
			log.debug('Executed didFinishLaunching');
			// Get Orbit devices
			this.getDevices();
		});
	}

	//**
	//** REQUIRED - Homebridge will call the "configureAccessory" method once for every cached accessory restored
	//**

	configureAccessory(accessory: PlatformAccessory) {
		// Added cached devices to the accessories array
		this.log.debug('Found cached accessory %s', accessory.displayName);
		this.accessories.push(accessory);
	}
	identify() {
		this.log.info('Identify the sprinkler!');
	}

	async getDevices() {
		try {
			let locationMatch;
			this.log.debug('Fetching Build info...');
			this.log.info('Getting Account info...');
			//login to API and get token
			const signinResponse = await this.orbitapi.getToken(this.email, this.password).catch((err: any) => {
				this.log.debug(`Failed to get api token ${err}`);
				throw new Error('Authentication failed or invalid response from Orbit API');
			});

			if (signinResponse && signinResponse.user_name) {
				this.log.info('Found account for', signinResponse.user_name);
				//this.log.debug('Found api key',signinResponse.orbit_api_key)
				this.log.debug('Found api key %s********************%s', signinResponse.orbit_api_key.substring(0, 35), signinResponse.orbit_api_key.substring(signinResponse.orbit_api_key.length - 35));
				this.token = signinResponse.orbit_api_key;
				this.userId = signinResponse.user_id;
			} else {
				throw new Error('Authentication failed or invalid response from Orbit API');
			}

			//connect WebSocket
			this.log.debug('Establish WebSocket connection');
			this.orbitapi.openConnection(this.token, null);
			this.irrigation.localMessage(this.orbit.updateService.bind(this));
			this.valve.localMessage(this.orbit.updateService.bind(this));

			//get device graph
			this.deviceGraph = await this.orbitapi.getDeviceGraph(this.token, this.userId).catch((err: any) => {
				throw new Error(`Failed to get graph info ${err}`);
			});
			this.deviceGraph.devices = this.deviceGraph.devices.sort((a: { type: number; }, b: { type: number; }) => {
				// read bridge info first
				return a.type > b.type ? 1 : a.type < b.type ? -1 : 0;
			});
			this.log.debug('Found device graph for user id %s, %s', this.userId, this.deviceGraph);
			this.deviceGraph.devices
				.filter((device: { address: { line_1: any; line_2?: string; city?: string; state?: string; country?: string; } | undefined; is_connected: any; hardware_version: any; name: any; network_topology_id: any; mesh_id: any; location_name: any; }) => {
					if (device.address == undefined) {
						device.address = {
							line_1: 'undefined location',
							line_2: '',
							city: '',
							state: '',
							country: '',
						};
						this.log.debug('No location address defined, adding dummy location %s', device.address);
					}
					if (!this.locationAddress || this.locationAddress == device.address.line_1) {
						if (device.is_connected) {
							this.log.info('Online device %s %s found at the configured location address: %s', device.hardware_version, device.name, device.address.line_1);
							if (device.network_topology_id) {
								this.networkTopologyId = device.network_topology_id;
								this.networkTopology = this.orbitapi.getNetworkTopologies(this.token, device.network_topology_id).catch((err: any) => {
									this.log.error('Failed to get network topology %s', err);
								});
							}
							if (device.mesh_id) {
								this.meshId = device.mesh_id;
								this.meshNetwork = this.orbitapi.getMeshes(this.token, device.mesh_id).catch((err: any) => {
									this.log.error('Failed to get network mesh %s', err);
								});
							}
						} else {
							this.log.info('Offline device %s %s found at the configured location address: %s', device.hardware_version, device.name, device.address.line_1);
							this.log.warn('%s is disconnected! This will show as non-responding in Homekit until the connection is restored.', device.name);
						}
						locationMatch = true;
					} else if (device.address.line_1 == 'undefined location' && (this.networkTopologyId == device.network_topology_id || this.meshId == device.mesh_id)) {
						if (device.is_connected) {
							this.log.info('Online device %s %s found for the location: %s', device.hardware_version, device.name, device.location_name);
						} else {
							this.log.info('Offline device %s %s found for the location: %s', device.hardware_version, device.name, device.location_name);
							this.log.warn('%s is disconnected! This will show as non-responding in Homekit until the connection is restored.', device.name);
						}
						locationMatch = true;
					} else {
						this.log.info('Skipping device %s %s at %s, not found at the configured location address: %s', device.hardware_version, device.name, device.address.line_1, this.locationAddress);
						locationMatch = false;
					}
					return locationMatch;
				}).forEach(async (device: { id: any; name: string; is_connected: any; }) => {
					// adding devices that met filter criteria
					try {
						const newDevice = await this.orbitapi.getDevice(this.token, device.id).catch((err: any) => {
							throw (`Failed to get devices info ${err}`);
						});
						const uuid: any = this.genUUID(newDevice.id);
						const index: any = this.accessories.findIndex(accessory => accessory.UUID === uuid);

						switch (newDevice.type) {
						//Handle Water accessories
						case 'sprinkler_timer':
							if (!this.showIrrigation) {
								this.log.info('Skipping Irrigation System %s %s based on config', newDevice.hardware_version, newDevice.name);
								if (this.accessories[index]) {
									this.log.debug('Removed cached device', device.id);
									this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
									delete this.accessories[index];
								}
								return;
							}
							this.log.debug('Adding Sprinkler Timer Device');
							if (newDevice.status.run_mode) {
								this.log.debug('Found device %s with status %s', newDevice.name, newDevice.status.run_mode);
							} else {
								this.log.warn('Found device %s with an unknown status %s, please check connection status', newDevice.name); ////error maybe
							}
							//this.log.warn(newDevice.hardware_version)

							// ***** Create and configure Valve Service ***** //

							if (this.showSimpleValve && newDevice.hardware_version.includes('HT25')) {
								this.log.debug('Creating and configuring new device');

								if (this.accessories[index]) {
									// Check if accessory changed
									if (this.accessories[index].getService(this.Service.AccessoryInformation)!.getCharacteristic(this.Characteristic.ProductData).value != 'Valve') {
										this.log.warn('Changing from Irrigation to Valve, check room assignments in Homekit');
										this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
										delete this.accessories[index];
									}
								}

								const valveAccessory = this.valve.createValveAccessory(newDevice, newDevice.zones[0], uuid, this.accessories[index]);
								const valveService = valveAccessory.getService(this.Service.Valve);
								this.valve.updateValveService(newDevice, newDevice.zones[0], valveService);
								this.valve.configureValveService(newDevice, valveService);
								// set current device status
								valveService.getCharacteristic(this.Characteristic.StatusFault).updateValue(!newDevice.is_connected);

								// Register platform accessory
								if (!this.accessories[index]) {
									this.log.debug('Registering platform accessory');
									this.log.info('Adding new accessory %s', valveAccessory.displayName);
									this.accessories[index] = valveAccessory;
									this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [valveAccessory]);
								}

								// Create and configure Battery Service if needed
								if (newDevice.battery != null) {
									this.log.info('Adding Battery status for %s', newDevice.name);
									let batteryStatus = valveAccessory.getService(this.Service.Battery);
									if (batteryStatus) {
										//update
										batteryStatus
											.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
											.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
											.setCharacteristic(this.Characteristic.BatteryLevel, newDevice.battery.percent);
									} else {
										//add new
										batteryStatus = this.battery.createBatteryService(newDevice);
										this.battery.configureBatteryService(batteryStatus);
										valveAccessory.addService(batteryStatus);
										this.api.updatePlatformAccessories([valveAccessory]);
									}
									batteryStatus = valveAccessory.getService(this.Service.Battery);
									valveAccessory.getService(this.Service.Valve).addLinkedService(batteryStatus);
								} else {
									//remove
									this.log.debug('%s has no battery found, skipping add battery service', newDevice.name);
									const batteryStatus = valveAccessory.getService(this.Service.Battery);
									if (batteryStatus) {
										valveAccessory.removeService(batteryStatus);
										this.api.updatePlatformAccessories([valveAccessory]);
									}
								}

								if (this.showSchedules) {
									let scheduleResponse = await this.orbitapi.getTimerPrograms(this.token, newDevice).catch((err: any) => {
										//this.log.error('Failed to get schedules for device', err)
										throw (`Failed to get schedules for device ${err}`);
									});
									scheduleResponse = scheduleResponse.sort((a: { program: number; }, b: { program: number; }) => {
										//return a.program - b.program
										return a.program > b.program ? 1 : a.program < b.program ? -1 : 0;
									});
									scheduleResponse.forEach((schedule: { enabled: any; name: string; program: any; device_id: any; id: any; }) => {
										if (schedule.enabled) {
											this.log.debug('adding schedules %s program %s', schedule.name, schedule.program);
											let switchService = valveAccessory.getServiceById(this.Service.Switch, this.genUUID(schedule.device_id + schedule.program));
											if (switchService) {
												//update
												switchService
													.setCharacteristic(this.Characteristic.On, false)
													.setCharacteristic(this.Characteristic.Name, device.name + ' ' + schedule.name)
													.setCharacteristic(this.Characteristic.ConfiguredName, schedule.name + ' ' + device.name)
													.setCharacteristic(this.Characteristic.SerialNumber, schedule.id)
													.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected);
												this.basicSwitch.configureSwitchService(newDevice, switchService);
												this.api.updatePlatformAccessories([valveAccessory]);
											} else {
												//add new
												switchService = this.basicSwitch.createScheduleSwitchService(newDevice, schedule);
												this.basicSwitch.configureSwitchService(newDevice, switchService);
												valveAccessory.addService(switchService, uuid);
												this.api.updatePlatformAccessories([valveAccessory]);
											}
											valveAccessory.getService(this.Service.Valve).addLinkedService(switchService);
											this.api.updatePlatformAccessories([valveAccessory]);
										} else {
											//skip
											this.log.warn('Skipping switch for disabled program %s %s', schedule.program, schedule.name);
											const switchService = valveAccessory.getServiceById(this.Service.Switch, schedule.program);
											if (switchService) {
												valveAccessory.removeService(switchService);
												this.api.updatePlatformAccessories([valveAccessory]);
											}
										}
									});
								} else {
									//remove
									const scheduleResponse = await this.orbitapi.getTimerPrograms(this.token, newDevice).catch((err: any) => {
										//this.log.error('Failed to get schedules for device', err)
										throw (`Failed to get schedules for device ${err}`);
									});
									scheduleResponse.forEach((schedule: { device_id: any; program: any; }) => {
										this.log.debug('removed schedule switch');
										const switchService = valveAccessory.getServiceById(this.Service.Switch, this.genUUID(schedule.device_id + schedule.program));
										if (switchService) {
											valveAccessory.removeService(switchService);
											this.api.updatePlatformAccessories([valveAccessory]);
										}
									});
								}

								if (this.showStandby) {
									const switchType = 'Standby';
									this.log.debug('adding new standby switch');
									const uuid = this.genUUID(newDevice.id + switchType);
									let switchService = valveAccessory.getServiceById(this.Service.Switch, uuid);
									if (switchService) {
										//update
										switchService
											.setCharacteristic(this.Characteristic.Name, newDevice.name + ' ' + switchType)
											.setCharacteristic(this.Characteristic.ConfiguredName, switchType + ' ' + newDevice.name)
											.setCharacteristic(this.Characteristic.StatusFault, !newDevice.is_connected);
										this.basicSwitch.configureSwitchService(newDevice, switchService);
										this.api.updatePlatformAccessories([valveAccessory]);
									} else {
										//add new
										switchService = this.basicSwitch.createSwitchService(newDevice, switchType);
										this.basicSwitch.configureSwitchService(newDevice, switchService);
										valveAccessory.addService(switchService, uuid);
										this.api.updatePlatformAccessories([valveAccessory]);
									}
									valveAccessory.getService(this.Service.Valve).addLinkedService(switchService);
									this.api.updatePlatformAccessories([valveAccessory]);
								} else {
									//remove
									this.log.debug('removed standby switch');
									const switchService = valveAccessory.getService(this.Service.Switch);
									if (switchService) {
										valveAccessory.removeService(switchService);
										this.api.updatePlatformAccessories([valveAccessory]);
									}
								}
							} else {

								// ***** Create and configure Irrigation Service ***** //

								this.log.debug('Creating and configuring new device');

								if (this.accessories[index]) {
									// Check if accessory changed
									if (this.accessories[index].getService(this.Service.AccessoryInformation)!.getCharacteristic(this.Characteristic.ProductData).value != 'Irrigation') {
										this.log.warn('Changing from Valve to Irrigation, check room assignments in Homekit');
										this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
										delete this.accessories[index];
									}
								}

								const irrigationAccessory = this.irrigation.createIrrigationAccessory(newDevice, uuid, this.accessories[index]);
								const irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
								this.irrigation.configureIrrigationService(newDevice, irrigationSystemService);
								// set current device status
								irrigationSystemService.getCharacteristic(this.Characteristic.StatusFault).updateValue(!newDevice.is_connected);

								// Register platform accessory
								if (!this.accessories[index]) {
									this.log.debug('Registering platform accessory');
									this.log.info('New accessory %s', irrigationAccessory.displayName);
									this.accessories[index] = irrigationAccessory;
									this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [irrigationAccessory]);
								}

								// Create and configure Battery Service if needed
								if (newDevice.battery != null) {
									this.log.info('Adding Battery status for %s', newDevice.name);
									let batteryStatus = irrigationAccessory.getService(this.Service.Battery);
									if (batteryStatus) {
										//update
										batteryStatus
											.setCharacteristic(this.Characteristic.ChargingState, this.Characteristic.ChargingState.NOT_CHARGEABLE)
											.setCharacteristic(this.Characteristic.StatusLowBattery, this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL)
											.setCharacteristic(this.Characteristic.BatteryLevel, newDevice.battery.percent);
									} else {
										//add new
										batteryStatus = this.battery.createBatteryService(newDevice);
										this.battery.configureBatteryService(batteryStatus);
										irrigationAccessory.addService(batteryStatus);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									}
									batteryStatus = irrigationAccessory.getService(this.Service.Battery);
									irrigationAccessory.getService(this.Service.IrrigationSystem).addLinkedService(batteryStatus);
								} else {
									//remove
									this.log.debug('%s has no battery found, skipping add battery service', newDevice.name);
									const batteryStatus = irrigationAccessory.getService(this.Service.Battery);
									if (batteryStatus) {
										irrigationAccessory.removeService(batteryStatus);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									}
								}

								// Create and configure Values services and link to Irrigation Service
								newDevice.zones = newDevice.zones.sort((a: { station: number; }, b: { station: number; }) => {
									return a.station - b.station;
								});
								newDevice.zones.forEach((zone: { enabled: boolean; name: any; station: string; sprinkler_type: any; }) => {
									zone.enabled = true; // need orbit version of enabled
									if (!this.useIrrigationDisplay && !zone.enabled) {
										this.log.info('Skipping disabled zone %s', zone.name);
									} else {
										this.log.debug('adding zone %s', zone.name);
										let valveService = irrigationAccessory.getServiceById(this.Service.Valve, zone.station);
										if (valveService) {
											valveService
												.setCharacteristic(this.Characteristic.ValveType, this.useIrrigationDisplay ? 1 : this.displayValveType)
												.setCharacteristic(this.Characteristic.RemainingDuration, 0)
												.setCharacteristic(this.Characteristic.ServiceLabelIndex, zone.station)
												.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected)
												.setCharacteristic(this.Characteristic.SerialNumber, this.genUUID('zone-' + zone.station))
												.setCharacteristic(this.Characteristic.Name, zone.name)
												.setCharacteristic(this.Characteristic.ConfiguredName, zone.name)
												.setCharacteristic(this.Characteristic.Model, zone.sprinkler_type);
											if (zone.enabled) {
												valveService.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED);
											} else {
												valveService.setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.NOT_CONFIGURED);
											}
											this.irrigation.configureValveService(newDevice, valveService);
											this.api.updatePlatformAccessories([irrigationAccessory]);
										} else {
											// add new
											valveService = this.irrigation.createValveService(newDevice, zone);
											this.irrigation.configureValveService(newDevice, valveService);
											irrigationAccessory.addService(valveService);
											this.api.updatePlatformAccessories([irrigationAccessory]);
										}

										if (this.useIrrigationDisplay) {
											this.log.debug('Using Irrigation system');
											irrigationAccessory.getService(this.Service.IrrigationSystem).addLinkedService(valveService);
											this.api.updatePlatformAccessories([irrigationAccessory]);
										} else {
											this.log.debug('Using separate tiles');
										}
									}
								});

								if (this.showSchedules) {
									let scheduleResponse = await this.orbitapi.getTimerPrograms(this.token, newDevice).catch((err: any) => {
										//this.log.error('Failed to get schedules for device', err)
										throw (`Failed to get schedules for device ${err}`);
									});
									scheduleResponse = scheduleResponse.sort((a: { program: number; }, b: { program: number; }) => {
										//return a.program - b.program
										return a.program > b.program ? 1 : a.program < b.program ? -1 : 0;
									});
									scheduleResponse.forEach((schedule: { enabled: any; name: string; program: any; device_id: any; id: any; }) => {
										if (schedule.enabled) {
											this.log.debug('adding schedules %s program %s', schedule.name, schedule.program);
											let switchService = irrigationAccessory.getServiceById(this.Service.Switch, this.genUUID(schedule.device_id + schedule.program));
											if (switchService) {
												//update
												switchService
													.setCharacteristic(this.Characteristic.On, false)
													.setCharacteristic(this.Characteristic.Name, device.name + ' ' + schedule.name)
													.setCharacteristic(this.Characteristic.ConfiguredName, schedule.name + ' ' + device.name)
													.setCharacteristic(this.Characteristic.SerialNumber, schedule.id)
													.setCharacteristic(this.Characteristic.StatusFault, !device.is_connected);
												this.basicSwitch.configureSwitchService(newDevice, switchService);
												irrigationAccessory.getService(this.Service.IrrigationSystem).addLinkedService(switchService);
											} else {
												//add new
												switchService = this.basicSwitch.createScheduleSwitchService(newDevice, schedule);
												this.basicSwitch.configureSwitchService(newDevice, switchService);
												irrigationAccessory.addService(switchService, uuid);
												this.api.updatePlatformAccessories([irrigationAccessory]);
											}
											irrigationAccessory.getService(this.Service.IrrigationSystem).addLinkedService(switchService);
											this.api.updatePlatformAccessories([irrigationAccessory]);
										} else {
											//skip
											this.log.warn('Skipping switch for disabled program %s %s', schedule.program, schedule.name);
											const switchService = irrigationAccessory.getServiceById(this.Service.Switch, schedule.program);
											if (switchService) {
												irrigationAccessory.removeService(switchService);
												this.api.updatePlatformAccessories([irrigationAccessory]);
											}
										}
									});
								} else {
									//remove
									const scheduleResponse = await this.orbitapi.getTimerPrograms(this.token, newDevice).catch((err: any) => {
										//this.log.error('Failed to get schedules for device', err)
										throw (`Failed to get schedules for device ${err}`);
									});
									scheduleResponse.forEach((schedule: { device_id: any; program: any; }) => {
										this.log.debug('removed schedule switch');
										const switchService = irrigationAccessory.getServiceById(this.Service.Switch, this.genUUID(schedule.device_id + schedule.program));
										if (switchService) {
											irrigationAccessory.removeService(switchService);
											this.api.updatePlatformAccessories([irrigationAccessory]);
										}
									});
								}

								if (this.showRunall) {
									const switchType = 'Run All';
									this.log.debug('adding new run all switch');
									const uuid = this.genUUID(newDevice.id + switchType);
									let switchService = irrigationAccessory.getServiceById(this.Service.Switch, uuid);
									if (switchService) {
										//update
										switchService
											.setCharacteristic(this.Characteristic.Name, newDevice.name + ' ' + switchType)
											.setCharacteristic(this.Characteristic.ConfiguredName, switchType + ' ' + newDevice.name)
											.setCharacteristic(this.Characteristic.StatusFault, !newDevice.is_connected);
										this.basicSwitch.configureSwitchService(newDevice, switchService);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									} else {
										//add new
										switchService = this.basicSwitch.createSwitchService(newDevice, switchType);
										this.basicSwitch.configureSwitchService(newDevice, switchService);
										irrigationAccessory.addService(switchService, uuid);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									}
									irrigationAccessory.getService(this.Service.IrrigationSystem).addLinkedService(switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								} else {
									//remove
									const switchType = 'Run All';
									this.log.debug('removed run all switch');
									const uuid = this.genUUID(newDevice.id + switchType);
									const switchService = irrigationAccessory.getServiceById(this.Service.Switch, uuid);
									if (switchService) {
										irrigationAccessory.removeService(switchService);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									}
								}

								if (this.showStandby) {
									const switchType = 'Standby';
									this.log.debug('adding new standby switch');
									const uuid = this.genUUID(newDevice.id + switchType);
									let switchService = irrigationAccessory.getServiceById(this.Service.Switch, uuid);
									if (switchService) {
										//update
										switchService
											.setCharacteristic(this.Characteristic.Name, newDevice.name + ' ' + switchType)
											.setCharacteristic(this.Characteristic.ConfiguredName, switchType + ' ' + newDevice.name)
											.setCharacteristic(this.Characteristic.StatusFault, !newDevice.is_connected);
										this.basicSwitch.configureSwitchService(newDevice, switchService);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									} else {
										//add new
										switchService = this.basicSwitch.createSwitchService(newDevice, switchType);
										this.basicSwitch.configureSwitchService(newDevice, switchService);
										irrigationAccessory.addService(switchService, uuid);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									}
									irrigationAccessory.getService(this.Service.IrrigationSystem).addLinkedService(switchService);
									this.api.updatePlatformAccessories([irrigationAccessory]);
								} else {
									//remove
									const switchType = 'Standby';
									this.log.debug('removed standby switch');
									const uuid = this.genUUID(newDevice.id + switchType);
									const switchService = irrigationAccessory.getServiceById(this.Service.Switch, uuid);
									if (switchService) {
										irrigationAccessory.removeService(switchService);
										this.api.updatePlatformAccessories([irrigationAccessory]);
									}
								}
							}
							break;
							// Handle Bridge accessories
						case 'bridge': {
							if (!this.showBridge) {
								this.log.info('Skipping Bridge %s %s based on config', newDevice.hardware_version, newDevice.name);
								if (this.accessories[index]) {
									this.log.debug('Removed cached device', device.id);
									this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
									delete this.accessories[index];
								}
								return;
							}
							this.log.debug('Adding Bridge Device');
							this.log.debug('Found device %s', newDevice.name);
							let bridgeAccessory;
							let bridgeService;

							switch (newDevice.hardware_version.split('-')[0]) {
							case 'BH1': {
								// Create and configure Gen 1Bridge Service
								const meshNetwork = await this.orbitapi.getMeshes(this.token, newDevice.mesh_id).catch((err: any) => {
									this.log.error('Failed to add G1 bridge %s', err);
								});
								this.log.debug('Creating and configuring new bridge');
								bridgeAccessory = this.bridge.createBridgeAccessory(newDevice, uuid, this.accessories[index]);
								bridgeService = bridgeAccessory.getService(this.Service.WiFiTransport);
								// Set current device status
								if (!bridgeService) {
									bridgeService = this.bridge.createBridgeService(newDevice, meshNetwork, false);
									bridgeAccessory.addService(bridgeService);
								}
								this.log.info('Adding Gen-1 Bridge');
								this.bridge.configureBridgeService(bridgeService);
								bridgeService.getCharacteristic(this.Characteristic.StatusFault).updateValue(!newDevice.is_connected);
								break;
							}
							case 'BH1G2': {
								// Create and configure Gen2 Bridge Service
								const networkTopology = await this.orbitapi.getNetworkTopologies(this.token, newDevice.network_topology_id).catch((err: any) => {
									this.log.error('Failed to add G2 bridge %s', err);
								});
								this.log.debug('Creating and configuring new bridge');
								bridgeAccessory = this.bridge.createBridgeAccessory(newDevice, uuid, this.accessories[index]);
								bridgeService = bridgeAccessory.getService(this.Service.WiFiTransport);
								// Set current device status
								if (!bridgeService) {
									bridgeService = this.bridge.createBridgeService(newDevice, networkTopology, true);
									bridgeAccessory.addService(bridgeService);
								}
								this.log.info('Adding Gen-2 Bridge');
								this.bridge.configureBridgeService(bridgeService);
								bridgeService.getCharacteristic(this.Characteristic.StatusFault).updateValue(!newDevice.is_connected);
								break;
							}
							default:
								this.log.warn('Wifi Hub hardware %s, not supported', newDevice.hardware_version);
								return;
							}
							if (!this.accessories[index]) {
								this.log.debug('Registering platform accessory');
								this.accessories[index] = bridgeAccessory;
								this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [bridgeAccessory]);
							}
							break;
						}
						// Handle Flood sensor accessories
						case 'flood_sensor': {
							if (!this.showFloodSensor && !this.showTempSensor && !this.showLimitsSensor) {
								this.log.info('Skipping Flood Sensor %s %s based on config', newDevice.hardware_version, newDevice.name);
								if (this.accessories[index]) {
									this.log.debug('Removed cached device', device.id);
									this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
									delete this.accessories[index];
								}
								return;
							}
							this.log.debug('Found device %s', newDevice.name);
							let FSAccessory;
							let batteryStatus;
							if (this.showFloodSensor || this.showTempSensor || this.showLimitsSensor) {
								FSAccessory = this.sensor.createFloodAccessory(newDevice, uuid, this.accessories[index]);
								if (!this.accessories[index]) {
									this.log.debug('Adding Flood Sensor Device');
									this.log.debug('Registering platform accessory');
									this.accessories[index] = FSAccessory;
									this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [FSAccessory]);
								}
								this.log.info('Adding Battery status for %s %s', newDevice.location_name, newDevice.name);
								batteryStatus = this.sensor.createBatteryService(newDevice, FSAccessory);
								this.sensor.configureBatteryService(batteryStatus);
								const service = FSAccessory.getService(this.Service.Battery);
								if (!service) {
									FSAccessory.addService(batteryStatus);
									this.api.updatePlatformAccessories([FSAccessory]);
								}
							} else {
								if (this.accessories[index]) {
									this.log.debug('Removed cached device', device.id);
									this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.accessories[index]]);
									delete this.accessories[index];
								}
							}

							if (this.showFloodSensor) {
								this.log.info('Adding Flood Sensor for %s %s', newDevice.location_name, newDevice.name);
								const leakSensor = this.sensor.createLeakService(newDevice);
								this.sensor.configureLeakService(leakSensor);
								const service = FSAccessory.getService(this.Service.LeakSensor);
								if (!service) {
									FSAccessory.addService(leakSensor);
									this.api.updatePlatformAccessories([FSAccessory]);
								} else {
									let currentAlarm;
									switch (newDevice.status.flood_alarm_status) {
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
									service.setCharacteristic(this.Characteristic.LeakDetected, currentAlarm).setCharacteristic(this.Characteristic.StatusFault, !device.is_connected);
								}
							} else {
								const service = FSAccessory.getService(this.Service.LeakSensor);
								if (service) {
									FSAccessory.removeService(service);
									this.api.updatePlatformAccessories([FSAccessory]);
								}
							}
							if (this.showTempSensor) {
								this.log.info('Adding Temperature Sensor for %s %s', newDevice.location_name, newDevice.name);
								const tempSensor = this.sensor.createTempService(newDevice);
								this.sensor.configureTempService(tempSensor);
								const service = FSAccessory.getService(this.Service.TemperatureSensor);
								if (!service) {
									FSAccessory.addService(tempSensor);
									this.api.updatePlatformAccessories([FSAccessory]);
								} else {
									service.setCharacteristic(this.Characteristic.CurrentTemperature, ((newDevice.status.temp_f - 32) * 5) / 9).setCharacteristic(this.Characteristic.StatusFault, !newDevice.is_connected);
								}
							} else {
								const service = FSAccessory.getService(this.Service.TemperatureSensor);
								if (service) {
									FSAccessory.removeService(service);
									this.api.updatePlatformAccessories([FSAccessory]);
								}
							}
							if (this.showLimitsSensor) {
								const occupancySensor = this.sensor.createOccupancyService(newDevice);
								this.sensor.configureOccupancyService(occupancySensor);
								const service = FSAccessory.getService(this.Service.OccupancySensor);
								if (!service) {
									FSAccessory.addService(occupancySensor);
									this.api.updatePlatformAccessories([FSAccessory]);
								} else {
									service.setCharacteristic(this.Characteristic.StatusFault, !newDevice.is_connected);
								}
							} else {
								const service = FSAccessory.getService(this.Service.OccupancySensor);
								if (service) {
									FSAccessory.removeService(service);
									this.api.updatePlatformAccessories([FSAccessory]);
								}
							}
							break;
						}
						default:
							// do nothing
						}
						this.orbitapi.onMessage(this.token, newDevice, this.orbit.updateService.bind(this));
						this.orbitapi.sync(this.token, newDevice);
					} catch (err: any) {
						this.log.error(err);
					}
				});
			setTimeout(() => {
				this.log.success('Orbit Platform finished loading');
			}, 2000);
		} catch (err: any) {
			if (this.retryAttempt < this.retryMax) {
				this.retryAttempt++;
				//this.log.error('Failed to get devices. Retry attempt %s of %s in %s seconds...', this.retryAttempt, this.retryMax, this.retryWait * this.retryAttempt)
				//this.log.error(err)
				/* I use a cleaner log format to avoid messy stack traces in the console */
				this.log.error('Failed to get devices (Attempt %s/%s). Next retry in %s seconds...', this.retryAttempt, this.retryMax, this.retryWait * this.retryAttempt);
				this.log.error('Reason: %s', err.message || err);
				setTimeout(async () => {
					this.getDevices();
				}, this.retryWait * this.retryAttempt * 1000);
			} else {
				//this.log.error('Failed to get devices...\n%s', err)
				/* Final attempt failed, logging reason and stopping retries */
    			this.log.error('Failed to get devices after maximum attempts. Stopping.');
    			this.log.error('Final reason: %s', err.message || err);
			}
		}
	}
}