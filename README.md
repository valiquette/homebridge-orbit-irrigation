<p align="left">
 <img width="300" src="logo/homebridge-bhyve.png" />
</p>

# homebridge-orbit-irrigation
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
<br>Orbit B-Hyve platform plugin for [Homebridge](https://github.com/nfarina/homebridge).
<br>Supporting
- B-Hyve Hose Timers.
- B-Hyve Underground Timers.
- B-Hyve Flood Sensor.

## About

This plugin provides options for use in HomeKit<br>Both option have additional switches as options for Standby/Off mode and a Run All across all devices along with any B-Hyve Program Schedules
1.	Irrigation System Accessory with zones that are linked (default configuration)
2.	Irrigation System Accessory with separate zones shown as a single tile
3.	Irrigation System Accessory with separate zones shown as a separate tiles (option in HomeKit)
4. Single Hose timers can be shown as a Valve.

<br> If you have more than one home on your B-Hyve account you may filter devices for a home based on the street address for the location you want to display in HomeKit. BLE devices such as Flood Sensors will follow the location of the Hub's address. (Did not work as expected). Addresses for flood sensors can be assigned [here](https://techsupport.orbitbhyve.com)
<br> If you have set manual preset runtimes for you controller or set zone flow rates in the B-Hyve app you can use these values for inital runtimes seen in HomeKit

## Notes on testing

This plugin has been tested or verified against hardware model/types
- Bridges BH1-0001 and BH1G2-0001
- Hose Timers HT25-0000, HT31-0001, HT32-0001 and HT34-0001
- Water Timers WT24-0001, WT25-0001, WT25G2-0001
- Flood Sensors FS1-0001

Other hardware models/types are expected work with this plugin and any feedback on devices not listed is welcome.

## Installation
1. Install this plugin using: npm install -g homebridge-orbit-irrigation
2. Suggest running as a child bridge
3. Use plugin settings to edit ``config.json`` and add your account detail. (HOOBS is not parsing the config completely and may omit key items, you must manually configure.)
4. Run Homebridge
5. Pair to HomeKit

## Config.json example with child bridge
```
{
	"name": "B-Hyve",
	"email": "username@mail.com",
	"password": "password",
	"locationAddress": "123 Easy St",
    "defaultRuntime": 1,
    "runtimeSource": 2,
    "useIrrigationDisplay": true,
    "showSimpleValve": true,
    "displayValveType": 0,
    "showIrrigation": true,
    "showBridge": false,
    "showFloodSensor": false,
    "showTempSensor": false,
    "showLimitsSensor": false,
    "showStandby": false,
    "showRunall": false,
    "showSchedules": false,
    "showAPIMessages": false,
    "showIncomingMessages": false,
    "showOutgoingMessages": false,
	"_bridge": {
		"username": "0E:76:36:78:EC:92",
		"port": 30395
	},
	"platform": "bhyve"
}
```