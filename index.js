const OrbitPlatform = require('./orbitplatform')
const packageJson = require('./package')

module.exports = homebridge => {
	PlatformAccessory = homebridge.platformAccessory
	Service = homebridge.hap.Service
	Characteristic = homebridge.hap.Characteristic
	UUIDGen = homebridge.hap.uuid
	PluginName = packageJson.name
	PluginVersion = packageJson.version
	PlatformName = 'bhyve'

	/* Inject HAP definitions into OrbitPlatform class for global access */
	OrbitPlatform.HapStatusError = homebridge.hap.HapStatusError
	OrbitPlatform.HAPStatus = homebridge.hap.HAPStatus

	homebridge.registerPlatform(PluginName, PlatformName, OrbitPlatform, true)
}