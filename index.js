const PlatformOrbit = require('./orbitplatform')

module.exports = (homebridge) => {
  PlatformAccessory = homebridge.platformAccessory
  Service = homebridge.hap.Service
  Characteristic = homebridge.hap.Characteristic
  UUIDGen = homebridge.hap.uuid
  PluginName = 'homebridge-orbit-irrigation'
  PlatformName = 'bhyve'
  
  homebridge.registerPlatform(PluginName, PlatformName, PlatformOrbit, true)
}