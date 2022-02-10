let packageJson=require('../package.json')
let OrbitAPI=require('../orbitapi')

function bridge (platform,log){
	this.log=log
	this.platform=platform
	this.orbitapi=new OrbitAPI(this,log)
}

bridge.prototype={

  createBridgeAccessory(device,uuid){
    this.log.debug('Create Bridge Accessory%s %s',device.id,device.name)
    let newPlatformAccessory=new PlatformAccessory(device.name, uuid)
    newPlatformAccessory.getService(Service.AccessoryInformation)
      .setCharacteristic(Characteristic.Name, device.name)
      .setCharacteristic(Characteristic.Manufacturer, "Orbit")
      .setCharacteristic(Characteristic.SerialNumber, device.mac_address)
      .setCharacteristic(Characteristic.Model, device.type)
      .setCharacteristic(Characteristic.Identify, true)
      .setCharacteristic(Characteristic.FirmwareRevision, device.firmware_version)
      .setCharacteristic(Characteristic.HardwareRevision, device.hardware_version)
      .setCharacteristic(Characteristic.SoftwareRevision, packageJson.version)
    return newPlatformAccessory
  },

  createBridgeService(device,network,G2){
    this.log.debug("create bridge service for %s",device.name )
		let bridgeService=new Service.Tunnel(device.name,device.id)
    if(G2){
			bridgeService
			.setCharacteristic(Characteristic.AccessoryIdentifier, network.network_key)
			.setCharacteristic(Characteristic.TunneledAccessoryAdvertising, true)
			.setCharacteristic(Characteristic.TunneledAccessoryConnected, true)
			.setCharacteristic(Characteristic.TunneledAccessoryStateNumber, Object.keys(network.devices).length)
		}
		else{
			bridgeService
			.setCharacteristic(Characteristic.AccessoryIdentifier, network.ble_network_key)
			.setCharacteristic(Characteristic.TunneledAccessoryAdvertising, true)
			.setCharacteristic(Characteristic.TunneledAccessoryConnected, true)
			.setCharacteristic(Characteristic.TunneledAccessoryStateNumber, Object.keys(network.devices).length-1)
		}
    return bridgeService
  },

  configureBridgeService(bridgeService){
    this.log.debug("configured bridge for %s",bridgeService.getCharacteristic(Characteristic.Name).value)
    bridgeService
    .getCharacteristic(Characteristic.TunneledAccessoryConnected)
  }

}

module.exports = bridge