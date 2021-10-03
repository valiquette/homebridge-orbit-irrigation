<p align="left">
 <img width="300" src="logo/homebridge-bhyve.png" />
</p>

# homebridge-platform-orbit
Orbit B-Hyve Irrigation System platform plugin for [Homebridge](https://github.com/nfarina/homebridge).

## About

This plugin provides 3 options for use in HomeKit<br>Both option have additional switches as options for Standby/Off mode and a Run All across all devices along with any B-Hyve Schedules
1.	Irrigation System Accessory with zones that are linked (default in configuration)
2.	Irrigation System Accessory with separate zones shown as a single tile 
3.	Irrigation System Accessory with separate zones shown as a separate tiles (option in HomeKit)

<br> There are plus and minus to each, so why not have options.
<br> if you have more than one home on your B-Hyve account you may filter devices for a home based on the street address for the location you want to display in HomeKit.

## Note on testing

This plugin has only be tested against multiple hose timers. It may still work with multi zone controllers. Feedback on those devices is welcome.

## Installation
1. Install this plugin using: npm install -g homebridge-orbit-irrigation
2. Suggest running as a child bridge	
3. Use plugin settings to edit ``config.json`` and add your account detail.
4. Run Homebridge
5. Pair to HomeKit

## Config.json example
```
"platforms": [
        {
            "name": "B-Hyve",
            "email": "username@mail.com",
            "password": "password",
            "defaultRuntime": 1,
            "useIrrigationDisplay": true,
            "showStandby": false,
            "showRunall": false,
            "showSchedules": false
            "_bridge": {
                "username": "0E:76:36:78:EC:92",
                "port": 30395
            },
            "platform": "bhyve"
        }
]
```