# Changes

## *Version 1.2.x breaking change will require the plugin config to be open and saved to display irrigation system.*

## 1.2.3
Fix
- Fixed bug with enabling standby.

## 1.2.2
Update
- Updated Readme with location info for flood sensors.
- Fixed low battery notifications for hose timers.
-	Improved supression of duplicate messaging in log.
-	Code Cleanup

## 1.2.1
Update
- Code Cleanup
-	Suppressed "Unknown sprinker device message received: device_status" message for XD hose timer.

## 1.2.0
Update
*Version 1.2.x upgrade from 1.1.x is a breaking change and will require the plugin config to be open and saved to display irrigation system.*
- Verified support for Gen2 Bridge BH1G2-0001 and Hose Timer HT31-0001.
-	Updated location for hub connected devices such as flood sensors to follow the location of the hub's address. 
-	Inital support for Flood Sensors FS1-0001.
-	Corrected device online state during start up.
-	Added config option to exclude irrigation system.  
-	Code cleanup for excluded devices.
-	Bumped dependencies.

## 1.1.4
Fix
- Corrected an error when no address is defined in the B-Hyve account.
-	Security update (CVE-2022-0155).

## 1.1.3
Enhancment
- Added configuration option to load zones with intial runtime option from H-Hyve. Runtime or flow rates will have to be configured in the App. Defautls will be used if no valid times are found.
-	Added low battery status to HomeKit status for Hose Timers
-	Removed Shower and Faucet valve types which are not compatable with an irrigation system from config schema
- Removed Show Bridge option from config schema
-	Updated readme
- Code Cleanup

## 1.1.2
Fix
- Corrected error handeling for older model types that could cause plugin to fail to start.
-	Corrected bugs with Run-All switch when more than one controller is present on account.
Update
-	Added supoort for Gen-1 Water Timer WT25
-	Updated readme with supported models.

## 1.1.1
Update
- Code cleanup

## 1.1.0
Update
- Updated build for multi zone Water Timers
- Bumped dependancies

## 1.0.7 beta
Fix
- Initial build for multi zone Water Timers WT25G2
- Suppressed logging pings to avoid filling up the log file
- Moved some info logging to debug
- Changed some of the logging text
- Fixed bug with HomeKit sync when timer expires
- Fixed bug with schedules not sowing as stopped if completed.

## 1.0.6
Fix
- Fix error that could cause plugin to crash and restart after restoring network connection when no additional switches are configured.

## 1.0.5
Fix
- Fix error starting if not using irrigation display
- Minor updates
- Code cleanup
- Added option to show valve as spigot

## 1.0.4 beta
Update
- Added verified badge to readme.
- Random error fixes.

## 1.0.3
Fix
- Fixed a bug in error messaging when updating service with a bad message.
- Bumped nodejs dependancy to current LTS revs.
- Bumped homebridge dependancy to 1.3.5

## 1.0.2
Fix
- Fixed a bug where homekit may show incorrect non-responding state.
- Bumped dependancy revs.

## 1.0.1
Initial 
- Support of irrigation system or valves.
- Battery supported.
- Bridge supported.
- Support for multiple locations.
- Irrigation and valve support for homeKit.
