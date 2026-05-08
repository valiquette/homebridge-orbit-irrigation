/* eslint-disable @typescript-eslint/no-explicit-any */
'use strict';
import type { PlatformAccessory, Service, Characteristic } from 'homebridge';
import OrbitAPI from './orbitapi.js';
import OrbitPlatform from './orbitplatform.js';

export default class Orbit {
	public readonly Service!: typeof Service;
	public readonly Characteristic!: typeof Characteristic;
	constructor(
		private readonly platform: OrbitPlatform,
		private orbitapi = new OrbitAPI(platform),
		private log = platform.log,
		private config = platform.config,
	) {
		this.Service = platform.Service;
		this.Characteristic = platform.Characteristic;
	}

	async updateService(message: string) {
		//process incoming messages
		try {
			const jsonBody: any = JSON.parse(message);
			if (jsonBody.source == 'local') {
				this.log.debug('simulated message');
			}
			const deviceName: string = this.platform.deviceGraph.devices.filter((result: { id: any; }) => result.id == jsonBody.device_id)[0].name;
			const deviceModel: string = this.platform.deviceGraph.devices.filter((result: { id: any; }) => result.id == jsonBody.device_id)[0].hardware_version;
			const eventType: string = this.platform.deviceGraph.devices.filter((result: { id: any; }) => result.id == jsonBody.device_id)[0].type;
			let activeService: any;
			const uuid: string = this.platform.genUUID(jsonBody.device_id);
			const index: number = this.platform.accessories.findIndex(accessory => accessory.UUID === uuid);
			/*****************************
								Possible states
					Active	InUse	  HomeKit Shows
					False	  False	  Off
					True    False	  Waiting
					True	  True	  Running
					False	  True	  Stopping
			******************************/
			if (this.platform.showExtraDebugMessages) {
				this.log.debug('extra message', jsonBody);
			} //additional debug info before suppressing duplicates
			this.platform.lastMessage.timestamp = jsonBody.timestamp; //ignore message with no timestamp deltas, ignoring mode changes
			this.platform.secondLastMessage.timestamp = jsonBody.timestamp; //ignore message with no timestamp deltas, ignoring mode changes
			if (JSON.stringify(this.platform.lastMessage) == JSON.stringify(jsonBody) || JSON.stringify(this.platform.secondLastMessage) == JSON.stringify(jsonBody)) {
				return;
			} //suppress duplicate websocket messages and checks sequence
			if (this.platform.showExtraDebugMessages) {
				this.log.info('extra message', jsonBody);
			} //additional debug info after suppressing duplicates
			if (jsonBody.event != 'battery_status') {
			//ignore event that is not logged
				this.platform.secondLastMessage = this.platform.lastMessage;
			}
			this.platform.lastMessage = jsonBody;
			switch (eventType) {
			case 'sprinkler_timer': {
				let irrigationAccessory: PlatformAccessory;
				let irrigationSystemService: any;
				let valveAccessory: PlatformAccessory;
				let percent: any;
				if (this.platform.showIrrigation) {
					//**Valve**//
					if (this.platform.showSimpleValve && deviceModel.includes('HT25')) {
						valveAccessory = this.platform.accessories[index];
						if (!valveAccessory) {
							return;
						}
						const batteryService: any = valveAccessory.getService(this.Service.Battery);
						const switchServiceStandby: any = valveAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + 'Standby'));
						const switchServiceRunall: any = valveAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + 'Run All'));
						switch (jsonBody.event) {
						case 'watering_in_progress_notification':
							activeService = valveAccessory.getService(this.Service.Valve);
							if (activeService) {
								//stop last if program is running
								if (jsonBody.program != 'manual') {
									if (!this.platform.activeProgram) {
										if (this.platform.showSchedules) {
											const switchServiceSchedule: any = valveAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + jsonBody.program));
											this.log.info('Running Program %s, %s', jsonBody.program, switchServiceSchedule.getCharacteristic(this.Characteristic.Name).value);
										} else {
											this.log.info('Running Program %s', jsonBody.program);
										}
									}
									if (this.platform.activeZone[jsonBody.device_id]) {
										activeService = valveAccessory.getServiceById(this.Service.Valve, this.platform.activeZone[jsonBody.device_id]);
										activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
										activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
										this.platform.activeZone[jsonBody.device_id] = false;
										if (jsonBody.source != 'local') {
											if (this.platform.activeProgram) {
												this.log.info('Device %s, Faucet %s scheduled watering', deviceName, activeService.getCharacteristic(this.Characteristic.Name).value);
											}
										}
									}
									this.platform.activeProgram = jsonBody.program;
								}
								//start active zone
								if (jsonBody.source != 'local') {
									this.platform.activeZone[jsonBody.device_id] = jsonBody.current_station;
									this.log.info('Device %s faucet, %s watering in progress for %s mins', deviceName, activeService.getCharacteristic(this.Characteristic.Name).value, Math.round(jsonBody.run_time));
								}
								activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
								activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
								activeService.getCharacteristic(this.Characteristic.SetDuration).updateValue(jsonBody.total_run_time_sec);
								activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(parseInt(jsonBody.run_time) * 60);
								this.platform.endTime[activeService.subtype] = new Date(Date.now() + parseInt(jsonBody.run_time) * 60 * 1000).toISOString();
							}
							break;
						case 'watering_complete':
							activeService = valveAccessory.getService(this.Service.Valve);
							if (activeService) {
								if (jsonBody.source != 'local') {
									this.log.info('Device %s faucet, %s watering completed', deviceName, activeService.getCharacteristic(this.Characteristic.Name).value);
									this.platform.activeZone[jsonBody.device_id] = false;
								}
								activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
								activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
							}
							break;
						case 'device_idle':
							activeService = valveAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + this.platform.activeProgram));
							if (this.platform.showRunall && switchServiceRunall) {
								switchServiceRunall.getCharacteristic(this.Characteristic.On).updateValue(false);
								this.log.info('Device is idle');
							}
							if (activeService) {
								//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
								this.log.info('Program %s completed', activeService.getCharacteristic(this.Characteristic.Name).value);
								activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
								this.platform.activeProgram = false;
							} else {
								if (this.platform.activeProgram) {
									this.log.info('Program %s completed', this.platform.activeProgram);
									this.platform.activeProgram = false;
								}
							}
							activeService = valveAccessory.getService(this.Service.Valve);
							if (activeService) {
								//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
								this.log.info('Device %s idle', deviceName);
								activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
								activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
							}
							break;
						case 'change_mode':
							this.log.debug('%s mode changed to %s', deviceName, jsonBody.mode);
							switch (jsonBody.mode) {
							case 'auto':
								if (this.platform.showStandby && switchServiceStandby) {
									switchServiceStandby.getCharacteristic(this.Characteristic.On).updateValue(false);
								}
								break;
							case 'manual':
								if (this.platform.showStandby && switchServiceStandby) {
									switchServiceStandby.getCharacteristic(this.Characteristic.On).updateValue(false);
								}
								break;
							case 'off':
								if (this.platform.howStandby && switchServiceStandby) {
									switchServiceStandby.getCharacteristic(this.Characteristic.On).updateValue(true);
								}
								break;
							}
							break;
						case 'device_connected':
							this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString());
							valveAccessory.services.forEach((service: any) => {
								if (this.Service.AccessoryInformation.UUID != service.UUID) {
									if (this.Service.Battery.UUID != service.UUID) {
										service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
									}
								}
							});
							break;
						case 'device_disconnected':
							this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, jsonBody.timestamp);
							valveAccessory.services.forEach((service: any) => {
								if (this.Service.AccessoryInformation.UUID != service.UUID) {
									if (this.Service.Battery.UUID != service.UUID) {
										service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
									}
								}
							});
							break;
						case 'battery_status':
							percent = 0;
							if (jsonBody.percent) {
								percent = jsonBody.percent;
							} else if (jsonBody.mv) {
								percent = ((jsonBody.mv - 2000) / (3400 - 2000)) * 100 > 100 ? 100 : ((jsonBody.mv - 2000) / (3400 - 2000)) * 100;
							}
							if (jsonBody.charging == undefined) {
								jsonBody.charging = false;
							}
							this.log.debug('update battery status %s to %s%, charging=%s', deviceName, percent, jsonBody.charging);
							batteryService.getCharacteristic(this.Characteristic.ChargingState).updateValue(jsonBody.charging);
							batteryService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(percent);
							break;
						case 'low_battery':
							this.log.warn('%s battery low', deviceName);
							activeService = valveAccessory.getServiceById(this.Service.Battery, jsonBody.device_id);
							if (activeService) {
								activeService.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
								//activeService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
							}
							break;
						case 'clear_low_battery':
							this.log.debug('%s battery good', deviceName);
							activeService = valveAccessory.getServiceById(this.Service.Battery, jsonBody.device_id);
							if (activeService) {
								activeService.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
								//activeService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
							}
							break;
						case 'device_status':
							if (this.platform.showExtraDebugMessages) {
								this.log.debug('%s updated at %s', deviceName, new Date(jsonBody.timestamp).toString());
							}
							break;
						case 'program_changed':
							this.log.debug('%s program %s %s changed', deviceName, jsonBody.program.program, jsonBody.program.name);
							break;
						case 'rain_delay':
							this.log.debug('%s rain delay %s hours for %s', deviceName, jsonBody.delay, jsonBody.rain_delay_weather_type);
							if (jsonBody.delay > 0) {
								//device is idle
								activeService = valveAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + this.platform.activeProgram));
								if (this.platform.showRunall && switchServiceRunall) {
									switchServiceRunall.getCharacteristic(this.Characteristic.On).updateValue(false);
									this.log.info('Device is idle');
								}
								if (activeService) {
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
									this.log.info('Program %s completed', activeService.getCharacteristic(this.Characteristic.Name).value);
									activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
									this.platform.activeProgram = false;
								} else {
									if (this.platform.activeProgram) {
										this.log.info('Program %s completed', this.platform.activeProgram);
										this.platform.activeProgram = false;
									}
								}
								activeService = valveAccessory.getService(this.Service.Valve);
								if (activeService) {
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
									this.log.info('Device %s idle', deviceName);
									activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
									activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
								}
							}
							break;
						case 'firmware_update_progress':
							//do nothing
							this.log.info('Firmware update in progress for %s to version %s - %s% ', deviceName, jsonBody.version, (jsonBody.offset / jsonBody.size));
							break;
						case 'fault':
							this.log.debug('Message received: %s for device id %s stations %s', jsonBody.event, jsonBody.device_id, jsonBody.stations);
							break;
						default:
							this.log.warn('%s Unknown faucet device message received: %s', deviceName, jsonBody.event);
							break;
						}
					} else {
						//irrigation system
						irrigationAccessory = this.platform.accessories[index];
						irrigationSystemService = irrigationAccessory.getService(this.Service.IrrigationSystem);
						if (!irrigationAccessory) {
							return;
						}
						const batteryService: any = irrigationAccessory.getService(this.Service.Battery);
						const switchServiceStandby: any = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + 'Standby'));
						const switchServiceRunall: any = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + 'Run All'));
						switch (jsonBody.event) {
						case 'watering_in_progress_notification':
							irrigationSystemService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
							activeService = irrigationAccessory.getServiceById(this.Service.Valve, jsonBody.current_station);
							if (activeService) {
								//stop last if program is running
								if (jsonBody.program != 'manual') {
									if (!this.platform.activeProgram) {
										if (this.platform.showSchedules) {
											const switchServiceSchedule: any = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + jsonBody.program));
											this.log.info('Program %s, %s started', jsonBody.program, switchServiceSchedule.getCharacteristic(this.Characteristic.Name).value);
										} else {
											this.log.info('Program %s started', jsonBody.program);
										}
									}
									if (this.platform.activeZone[jsonBody.device_id]) {
										activeService = irrigationAccessory.getServiceById(this.Service.Valve, this.platform.activeZone[jsonBody.device_id]);
										activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
										activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
										this.platform.activeZone[jsonBody.device_id] = false;
										if (jsonBody.source != 'local') {
											if (this.platform.activeProgram) {
												this.log.info('Device %s, Zone %s watering completed, starting next Zone', deviceName, activeService.getCharacteristic(this.Characteristic.Name).value);
											}
										}
									}
									this.platform.activeProgram = jsonBody.program;
								}
								//start active zone
								if (jsonBody.source != 'local') {
									this.platform.activeZone[jsonBody.device_id] = jsonBody.current_station;
									if (this.platform.activeProgram) {
										this.log.info('Device %s, Zone %s watering in progress for %s mins', deviceName, activeService.getCharacteristic(this.Characteristic.Name).value, Math.round(jsonBody.run_time));
									}
								}
								if (!jsonBody.total_run_time_sec) {
									//added for older firmware that may not have this field populated
									jsonBody.total_run_time_sec = jsonBody.run_time * 60;
								}
								activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
								activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE);
								activeService.getCharacteristic(this.Characteristic.SetDuration).updateValue(jsonBody.total_run_time_sec);
								activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(parseInt(jsonBody.run_time) * 60);
								this.platform.endTime[activeService.subtype] = new Date(Date.now() + parseInt(jsonBody.run_time) * 60 * 1000).toISOString();
							}
							//update other zones in quque with status
							if (jsonBody.water_event_queue) {
								if (jsonBody.water_event_queue.length > 0) {
									let match: boolean;
									const deviceResponse: any = await this.orbitapi.getDevice(this.platform.token, jsonBody.device_id).catch(err => {
										this.log.error('Failed to get device response %s', err);
									});
									for (let n = 0; n < deviceResponse.zones.length; n++) {
										match = false;
										deviceResponse.zones[n].enabled = true; // need orbit version of enabled
										if (deviceResponse.zones[n]) {
											for (let i = 0; i < jsonBody.water_event_queue.length; i++) {
												if (deviceResponse.zones[n].station == jsonBody.current_station && jsonBody.current_station == jsonBody.water_event_queue[i].station) {
													this.log.debug('%s program %s for zone-%s %s running', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name);
													//zone already running
													/*
																	activeService=irrigationAccessory.getServiceById(this.Service.Valve, deviceResponse.zones[n].station)
																	activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE)
																	activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.IN_USE)
																	activeService.getCharacteristic(this.Characteristic.SetDuration).updateValue(jsonBody.total_run_time_sec)
																	activeService.getCharacteristic(this.Characteristic.RemainingDuration).updateValue(parseInt(jsonBody.run_time * 60))
																	this.endTime[activeService.subtype]= new Date(Date.now() + parseInt(jsonBody.run_time * 60 * 1000)).toISOString()
																	*/
													match = true;
													break;
												} else if (deviceResponse.zones[n].station == jsonBody.water_event_queue[i].station) {
													this.log.debug('%s program %s for zone-%s %s waiting', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name);
													activeService = irrigationAccessory.getServiceById(this.Service.Valve, deviceResponse.zones[n].station);
													if (activeService) {
														activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.ACTIVE);
														activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
													}
													match = true;
													break;
												}
											}
											if (!match) {
												this.log.debug('%s program %s for zone-%s %s stopped', deviceName, jsonBody.program, deviceResponse.zones[n].station, deviceResponse.zones[n].name);
												activeService = irrigationAccessory.getServiceById(this.Service.Valve, deviceResponse.zones[n].station);
												if (activeService) {
													activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
													activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
												}
												continue;
											}
										}
									}
								}
								//turn program switch off at last zone
								if (jsonBody.water_event_queue.length == 1) {
									activeService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + this.platform.activeProgram));
									if (activeService) {
										//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
										this.log.info('Program %s finishing last zone', activeService.getCharacteristic(this.Characteristic.Name).value);
										setTimeout(() => {
											activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
										}, jsonBody.water_event_queue[0].run_time_sec * 1000);
										//activeService.getCharacteristic(this.Characteristic.On).updateValue(false)
										this.platform.activeProgram = false;
									} else {
										if (this.platform.activeProgram) {
											this.log.info('Program %s finished', this.platform.activeProgram);
											this.platform.activeProgram = false;
										}
									}
								}
							}
							break;
						case 'watering_complete':
							irrigationSystemService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
							activeService = irrigationAccessory.getServiceById(this.Service.Valve, this.platform.activeZone[jsonBody.device_id]);
							if (activeService) {
								if (jsonBody.source != 'local') {
									this.log.info('Device %s, Zone %s watering completed', deviceName, activeService.getCharacteristic(this.Characteristic.Name).value);
									this.platform.activeZone[jsonBody.device_id] = false;
								}
								activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
								activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
							}
							break;
						case 'device_idle':
							irrigationSystemService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
							activeService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + this.platform.activeProgram));
							if (this.platform.showRunall && switchServiceRunall) {
								switchServiceRunall.getCharacteristic(this.Characteristic.On).updateValue(false);
								this.log.info('Device is idle');
							}
							if (activeService) {
								//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
								this.log.info('Program %s completed', activeService.getCharacteristic(this.Characteristic.Name).value);
								activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
								this.platform.activeProgram = false;
							} else {
								if (this.platform.activeProgram) {
									this.log.info('Program %s completed', this.platform.activeProgram);
									this.platform.activeProgram = false;
								}
							}
							activeService = irrigationAccessory.getServiceById(this.Service.Valve, this.platform.activeZone[jsonBody.device_id]);
							if (activeService) {
								//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
								this.log.info('Device %s idle', deviceName);
								activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
								activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
							}
							break;
						case 'change_mode':
							this.log.debug('%s mode changed to %s', deviceName, jsonBody.mode);
							//this.log.info(activeService.getCharacteristic(this.Characteristic.Name))
							switch (jsonBody.mode) {
							case 'auto':
								irrigationSystemService.getCharacteristic(this.Characteristic.ProgramMode).updateValue(this.Characteristic.ProgramMode.PROGRAM_SCHEDULED);
								if (this.platform.showStandby && switchServiceStandby) {
									switchServiceStandby.getCharacteristic(this.Characteristic.On).updateValue(false);
								}
								break;
							case 'manual':
								irrigationSystemService.getCharacteristic(this.Characteristic.ProgramMode).updateValue(this.Characteristic.ProgramMode.PROGRAM_SCHEDULED_MANUAL_MODE);
								if (this.platform.showStandby && switchServiceStandby) {
									switchServiceStandby.getCharacteristic(this.Characteristic.On).updateValue(false);
								}
								break;
							case 'off':
								irrigationSystemService.getCharacteristic(this.Characteristic.ProgramMode).updateValue(this.Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED);
								if (this.platform.showStandby && switchServiceStandby) {
									switchServiceStandby.getCharacteristic(this.Characteristic.On).updateValue(true);
								}
								break;
							}
							break;
						case 'device_connected':
							this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString());
							irrigationAccessory.services.forEach((service: any) => {
								if (this.Service.AccessoryInformation.UUID != service.UUID) {
									if (this.Service.Battery.UUID != service.UUID) {
										service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
									}
								}
								if (this.Service.Valve.UUID == service.UUID) {
									service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
								}
								if (this.Service.Switch.UUID == service.UUID) {
									service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
								}
							});
							break;
						case 'device_disconnected':
							this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, jsonBody.timestamp);
							irrigationAccessory.services.forEach((service: any) => {
								if (this.Service.AccessoryInformation.UUID != service.UUID) {
									if (this.Service.Battery.UUID != service.UUID) {
										service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
									}
								}
								if (this.Service.Valve.UUID == service.UUID) {
									service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
								}
								if (this.Service.Switch.UUID == service.UUID) {
									service.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
								}
							});
							break;
						case 'battery_status':
							percent = 0;
							if (jsonBody.percent) {
								percent = jsonBody.percent;
							} else if (jsonBody.mv) {
								percent = ((jsonBody.mv - 2000) / (3400 - 2000)) * 100 > 100 ? 100 : ((jsonBody.mv - 2000) / (3400 - 2000)) * 100;
							}
							if (jsonBody.charging == undefined) {
								jsonBody.charging = false;
							}
							this.log.debug('update battery status %s to %s%, charging=%s', deviceName, percent, jsonBody.charging);
							batteryService.getCharacteristic(this.Characteristic.ChargingState).updateValue(jsonBody.charging);
							batteryService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(percent);
							break;
						case 'low_battery':
							this.log.warn('%s battery low', deviceName);
							activeService = irrigationAccessory.getServiceById(this.Service.Battery, jsonBody.device_id);
							if (activeService) {
								activeService.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
								//activeService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
							}
							break;
						case 'clear_low_battery':
							this.log.debug('%s battery good', deviceName);
							activeService = irrigationAccessory.getServiceById(this.Service.Battery, jsonBody.device_id);
							if (activeService) {
								activeService.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
								//activeService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(jsonBody.percent_remaining)
							}
							break;
						case 'device_status':
							if (this.platform.CharacteristicshowExtraDebugMessages) {
								this.log.debug('%s updated at %s', deviceName, new Date(jsonBody.timestamp).toString());
							}
							break;
						case 'program_changed':
							this.log.debug('%s program %s %s changed', deviceName, jsonBody.program.program, jsonBody.program.name);
							break;
						case 'rain_delay':
							this.log.debug('%s rain delay %s hours for %s', deviceName, jsonBody.delay, jsonBody.rain_delay_weather_type);
							if (jsonBody.delay > 0) {
								//device is idle
								irrigationSystemService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
								activeService = irrigationAccessory.getServiceById(this.Service.Switch, this.platform.genUUID(jsonBody.device_id + this.platform.activeProgram));
								if (this.platform.showRunall && switchServiceRunall) {
									switchServiceRunall.getCharacteristic(this.Characteristic.On).updateValue(false);
									this.log.info('Device is idle');
								}
								if (activeService) {
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
									this.log.info('Program %s completed', activeService.getCharacteristic(this.Characteristic.Name).value);
									activeService.getCharacteristic(this.Characteristic.On).updateValue(false);
									this.platform.activeProgram = false;
								} else {
									if (this.platform.activeProgram) {
										this.log.info('Program %s completed', this.platform.activeProgram);
										this.platform.activeProgram = false;
									}
								}
								activeService = irrigationAccessory.getServiceById(this.Service.Valve, this.platform.activeZone[jsonBody.device_id]);
								if (activeService) {
									//this.log.info('Device %s, %s zone idle',deviceName, activeService.getCharacteristic(this.Characteristic.Name).value)
									this.log.info('Device %s idle', deviceName);
									activeService.getCharacteristic(this.Characteristic.Active).updateValue(this.Characteristic.Active.INACTIVE);
									activeService.getCharacteristic(this.Characteristic.InUse).updateValue(this.Characteristic.InUse.NOT_IN_USE);
								}
							}
							break;
						case 'rain_sensor_status':
							//do nothing
							this.log.debug('%s rain sensor event', deviceName);
							break;
						case 'firmware_update_progress':
							//do nothing
							this.log.info('Firmware update in progress for %s to version %s - %s% ', deviceName, jsonBody.version, (jsonBody.offset / jsonBody.size));
							break;
						case 'fault':
							this.log.debug('Message received: %s for device id %s stations %s', jsonBody.event, jsonBody.device_id, jsonBody.stations);
							break;
						default:
							this.log.warn('%s Unknown sprinkler device message received: %s', deviceName, jsonBody.event);
							break;
						}
					}
				}
				break;
			}
			case 'bridge': {
				let bridgeAccessory: PlatformAccessory;
				if (this.platform.showBridge) {
					bridgeAccessory = this.platform.accessories[index];
					if (!bridgeAccessory) {
						return;
					}
					activeService = bridgeAccessory.getServiceById(this.Service.WiFiTransport, jsonBody.device_id);
				}
				switch (jsonBody.event) {
				case 'device_connected':
					this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString());
					if (this.platform.showBridge) {
						activeService.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
					}
					break;
				case 'device_disconnected':
					this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, new Date(jsonBody.timestamp).toString());
					if (this.platform.showBridge) {
						activeService.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
					}
					break;
				case 'device_idle':
					//do nothing
					break;
				case 'change_mode':
					//do nothing
					break;
				case 'fault':
					//do nothing
					this.log.debug('Message received: %s for bridge device id %s', jsonBody.event, jsonBody.device_id);
					break;
				case 'firmware_update_progress':
					//do nothing
					this.log.info('Firmware update in progress for %s to version %s - %s% ', deviceName, jsonBody.version, (jsonBody.offset / jsonBody.size));
					break;
				default:
					this.log.warn('%s Unknown bridge device message received: %s', deviceName, jsonBody.event);
					break;
				}
				break;
			}
			case 'flood_sensor': {
				let FSAccessory: PlatformAccessory;
				let leakService: any;
				let tempService: any;
				let batteryService: any;
				let occupancySensor: any;
				if (this.platform.showFloodSensor || this.platform.showTempSensor) {
					FSAccessory = this.platform.accessories[index];
					if (!FSAccessory) {
						return;
					}
					leakService = FSAccessory.getService(this.Service.LeakSensor);
					tempService = FSAccessory.getService(this.Service.TemperatureSensor);
					batteryService = FSAccessory.getService(this.Service.Battery);
					occupancySensor = FSAccessory.getService(this.Service.OccupancySensor);
					switch (jsonBody.event) {
					case 'battery_status':
						this.log.debug('update battery status %s %s to %s%', jsonBody.location_name, jsonBody.name, jsonBody.battery.percent);
						batteryService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(jsonBody.battery.percent);
						if (jsonBody.battery.percent <= this.platform.lowBattery) {
							batteryService.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW);
						} else {
							batteryService.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
						}
						//batteryService.getCharacteristic(this.Characteristic.BatteryLevel).updateValue(Math.floor((Math.random() * 100) + 1)) //enable for testing
						break;
					case 'fs_status_update':
						//this.log.info('%s status update at %s',deviceName,new Date(jsonBody.timestamp).toString())
						if (this.platform.showFloodSensor) {
							switch (jsonBody.flood_alarm_status) {
							case 'ok':
								leakService.getCharacteristic(this.Characteristic.LeakDetected).updateValue(this.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
								break;
							case 'alarm':
								leakService.getCharacteristic(this.Characteristic.LeakDetected).updateValue(this.Characteristic.LeakDetected.LEAK_DETECTED);
								break;
							default:
								leakService.getCharacteristic(this.Characteristic.LeakDetected).updateValue(this.Characteristic.LeakDetected.LEAK_NOT_DETECTED);
								break;
							}
						}
						if (this.platform.showTempSensor) {
							tempService.getCharacteristic(this.Characteristic.CurrentTemperature).updateValue(((jsonBody.temp_f - 32) * 5) / 9);
						}
						if (this.platform.showLimitsSensor) {
							switch (jsonBody.temp_alarm_status) {
							case 'ok':
								occupancySensor.getCharacteristic(this.Characteristic.OccupancyDetected).updateValue(this.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
								break;
							case 'low_temp_alarm':
								occupancySensor.getCharacteristic(this.Characteristic.OccupancyDetected).updateValue(this.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED);
								break;
							case 'high_temp_alarm':
								occupancySensor.getCharacteristic(this.Characteristic.OccupancyDetected).updateValue(this.Characteristic.OccupancyDetected.OCCUPANCY_DETECTED);
								break;
							default:
								occupancySensor.getCharacteristic(this.Characteristic.OccupancyDetected).updateValue(this.Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED);
								break;
							}
						}
						break;
					case 'device_connected':
						this.log.info('%s connected at %s', deviceName, new Date(jsonBody.timestamp).toString());
						if (this.platform.showFloodSensor) {
							leakService.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
						}
						if (this.platform.showTempSensor) {
							tempService.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
						}
						if (this.platform.showLimitsSensor) {
							occupancySensor.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.NO_FAULT);
						}
						break;
					case 'device_disconnected':
						this.log.warn('%s disconnected at %s! This will show as non-responding in Homekit until the connection is restored.', deviceName, new Date(jsonBody.timestamp).toString());
						if (this.platform.showFloodSensor) {
							leakService.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
						}
						if (this.platform.showTempSensor) {
							tempService.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
						}
						if (this.platform.showLimitsSensor) {
							occupancySensor.getCharacteristic(this.Characteristic.StatusFault).updateValue(this.Characteristic.StatusFault.GENERAL_FAULT);
						}
						break;
					case 'fault':
						//do nothing
						break;
					default:
						this.log.warn('%s Unknown flood sensor device message received: %s', deviceName, jsonBody.event);
						break;
					}
				}
				break;
			}
			default:
				this.log.warn('%s Unknown irrigation device message received: %s', deviceName, jsonBody.event);
				break;
			}
			return;
		} catch (err) {
			this.log.error('Error updating service %s', err);
		}
	}
}