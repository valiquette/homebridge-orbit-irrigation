# Changes

## 1.2.45
fix
-  fixed issue #108 plugin crashing for some valve models.
-  bumped dependencies


## 1.2.44
fix
-  fixed issue #105 plugin crashing in some cases.

## 1.2.43
fix
-  fixed websocket closing issue
-  fixed quick run: issue #75
-  fixed issue updated program status when in rain or freeze delay
-  bumped dependencies

## 1.2.42
fix
-  fixed websocket issue sending messages for irrigation device
-  fixed charateristic warning
-  fixed issue with schedules switches
-  code cleanup
-  bumped dependencies

## 1.2.41
fix
-  fixed warning message when showing switches when both schedules and standby are selected
-  fixed websocket issue that was preventing some incoming message from being recieved

## 1.2.40
fix
-  fixed issue with homebridge 2.0 invalid character warning. May need to remove limit sensor accessory from homebridge so it can re added on restart.
-  adjustments to battery percent calulations for multizone timers
-  refactored WebSocket connectivity
-  fixed "Error: This callback function has already been called by someone else". Which may have been seen in certian use cases with default schedule names. Will require the extra switch accessories to be removed and re added.
-  fixed crash when exposing bridge
-  bumped dependencies

## 1.2.39
fix
-  fixed issue with clearing low battery events for hose timers

## 1.2.38
update
-  code cleanup
-  bumped dependencies

## 1.2.37
update
-  code cleanup
-  fixed an issue with battery status updates for flood sensors

## 1.2.36
update
-  code cleanup
-  adjust timeouts
-  corrected a naming issue in logging

## 1.2.35
update
-  support for homebridge 2.0

## 1.2.34-beta.0
beta
-  initial support for homebridge 2.0
-  removed deprecated getValue()

## 1.2.33
fix
-  Fixed a crash condition when trying to expose gen 2 wifi hub with hardware version of -0000.
-  Include error handleing for new devices in the future.

## 1.2.32
fix
-  Add default default nameing for zones with no naming in the B-Hyve app.

## 1.2.30
Update
-  Suppressed empty fault warning.
-  Add default model "unknown" for devices with no type configured in the B-Hyve app.
-  Bumped dependencies.
-  node.js v22 support.

## 1.2.29
Update
-  Bumped dependencies.

## 1.2.28
Bug Fix
-  Fixed issue introduced with IOS 17 where multiple set commands are sent from the IOS app if zone is started by sliding vs tap. This create a start stop loop.

## 1.2.27
update
-  Code cleanup
-  Bumped dependencies.

## 1.2.26
Fix
-  Fixed bug with runtimes on device with older firmware.

## 1.2.25
Fix
-  Fixed bug with Flood sensor battery update.

## 1.2.24
Update
-  Fixed display issues with running times in homebridge.
-  Fixed logging issue with zone numbers when running schedule. (issue #73)
-  Fixed battery status calulation for displayed values.
-  Refactored code to address (issue #70)
-  Bumped dependencies.

## 1.2.23
Update
-  Fixed some error meesages with running programs.
-  Added support for standby and schedules for simple valves.

## 1.2.22
Fixes
-  Fixed issue where zones failed to update correctly when watering competed when more than one contoller was active at the same time. (issue #69)
-  Fixed issue where accessories could move from assigned room to default room. (issue #70)
-  Changes to naming for additional switches

## 1.2.21
Update
- improved handling of misconfigured device in app
- fixed bug with multiple locations
- fixed bug causing error message when starting a zone
- Bumped Node.jS dependencies.

## 1.2.20
Fixes
- Fixed crash associated with (issue #65)
- Fixed error (issue #66) Run All switch failed.
Update
- Improved Program updates to reflect zones in queue
- Code cleanup
- Bumped Node.jS dependencies.

## 1.2.19
Update
- Code cleanup
- Bumped Node.jS dependencies.
- Fixed Battery state (issue #63)

## 1.2.18
Update
- Automatically removed unused cached devices.
Fix
-  Improved battery updates and adjusted to changes in notifications.
-  Fixed characteristic battery level warning.

## 1.2.17
Update
-  Refactor portions of code.
Fix
-  Low Battery warning for hose timers on new firmware.
-  Fixed error handeling for 504 errors that result in a restart.
-  Fix error (issue #60) trying to close a WebSocket before it is opened when trying to load fails.

## 1.2.16
Update
-  Added support to show single hose timer as simple valve.
-  Updated readme file.
-  Added settings to expose additional debug messaging.
-  Improved WebSocket logging
-  Added support for node.js v20.
-  Removed support for node.js v14.
-  Bumped dependencies.
Fix
-  Fixed bug (issue #57) and crash scenario when trying to add disabled program.
-  Fixed a bug (issue #58) where connection closed if an error was caught with no network connection.


## 1.2.15
Update
- Improved startup routine.
- Improved error logging.
- Cleaned whitespace.
- Added option to suppress API responses in debug log.
- Bumped dependencies.
- Code Cleanup.

## 1.2.14

Update
- Bumped dependencies.
- Code Cleanup.

## 1.2.13
Fix
- Bug Fix

## 1.2.12
Update
- Bumped dependencies.
- Inital support for Homebridge v2.0.0
- Removed dependency on depratacted Homekit characteristic.
- Code Cleanup

## 1.2.11
Update
- Bumped dependencies.

## 1.2.10
Update
- Added explict user-agent info to API calls.
- Bumped dependencies.

## 1.2.9
Update
-  Updated readme.
-  Corrected error handeling during startup.
-  Changed configuration default to true for use irrigation display.
-  API updates
-  Code Cleanup

## 1.2.8
Update
- Changed default naming for flood sensor limits to avoid unsupported characters.
- Code Cleanup.
- Bumped Dependancies.

## 1.2.7
Update
- Changed configuration default to false for use irrigation display, due to IOS bug intoduced with 15.4 and still not fixed in 15.5
- Initial support for node.js 18
- Bumped dependencies.

## 1.2.6
Update
-	Suppressed additional debug logging.
-  Improved error messaging.
-	Fixed sensor and XD Timer low battery notifications.
- Code Cleanup

## 1.2.5
Update
-	fixed XD timer battery status error.

## 1.2.4
Update
- Bumped Dependancy.
-	Updated XD timer battery status
-	code Cleanup

## 1.2.2
Update
- Updated Readme with location info for flood sensors.
- Fixed low battery notifications for hose timers.
-	Improved supression of duplicate messaging in log.
-	Code Cleanup

## 1.2.1
Update
-  Code Cleanup
-	Suppressed "Unknown sprinker device message received: device_status" message for XD hose timer.

## 1.2.0
Update
*Version 1.2.x upgrade from 1.1.x is a breaking change and will require the plugin config to be open and saved to display irrigation system.*
-  Verified support for Gen2 Bridge BH1G2-0001 and Hose Timer HT31-0001.
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
-  Removed Show Bridge option from config schema
-	Updated readme
-  Code Cleanup

## 1.1.2
Fix
-  Corrected error handeling for older model types that could cause plugin to fail to start.
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
