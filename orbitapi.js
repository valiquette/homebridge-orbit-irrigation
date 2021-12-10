const axios = require('axios')
const ws = require('ws')
const reconnectingwebsocket = require('reconnecting-websocket')

const endpoint = 'https://api.orbitbhyve.com/v1/'
const WS_endpoint = 'wss://api.orbitbhyve.com/v1/'

const maxPingInterval = 25000 // Websocket get's timed out after 30s, will set randmon value between 20 and 25
const minPingInterval = 20000

function OrbitAPI (platform,log){
    this.log=log
    this.platform=platform
    this.rws=new WebSocketProxy()
    this.wsp=new WebSocketProxy(log);
}

OrbitAPI.prototype={

    getToken: async function(email,password){
    // Get token
    try {  
        this.log.debug('Retrieving API key')
        let response = await axios({
            method: 'post',
            url: endpoint + 'session',
            headers: {
            'Content-Type': 'application/json',
            'orbit-app-id': 'Bhyve Dashboard'
            },
            data:{
            'session': {
                'email': email,
                'password': password
                }
            }, 
            responseType: 'json'
        }).catch(err=>{this.log.error('Error getting API key %s', err)})
        this.log.debug('get token response',JSON.stringify(response.data,null,2))
        return  response
        }catch(err) {this.log.error('Error retrieving API key %s', err)}
    },
    
    getDevices: async function(token){
    // Get the device details
    try {  
        this.log.debug('Retrieving devices')
        const response = await axios({
            method: 'get',
            url: endpoint + 'devices',
            headers: {
            'Content-Type': 'application/json',
            'orbit-api-key': token, 
            'orbit-app-id': 'Bhyve Dashboard'
            },
            responseType: 'json'
        }).catch(err=>{this.log.error('Error getting devices %s', err)})
        this.log.debug('get devices response',JSON.stringify(response.data,null,2))
        return response
        }catch(err) {this.log.error('Error retrieving devices %s', err)}
    },

    getMeshes: async function(token,meshId){
        // Get mesh details
        try {  
            this.log.debug('Retrieving mesh info')
            const response = await axios({
                method: 'get',
                url: endpoint + 'meshes/'+meshId,
                headers: {
                'Content-Type': 'application/json',
                'orbit-api-key': token, 
                'orbit-app-id': 'Bhyve Dashboard'
                },
                responseType: 'json'
            }).catch(err=>{this.log.error('Error getting mesh info %s', err)})
            this.log.debug('get mesh info response',JSON.stringify(response.data,null,2))
            return response
            }catch(err) {this.log.error('Error retrieving mesh info %s', err)}
        },

      getDeviceGraph: async function(token,userId){
        // Get device graph details
        try {  
            this.log.debug('Retrieving device graph info')
            const response = await axios({
                method: 'post',
                url: endpoint + 'graph2',
                headers: {
                'Content-Type': 'application/json',
                'orbit-api-key': token, 
                'orbit-app-id': 'Bhyve Dashboard'
                },
                data: {
                  "query": [
                      "devices",
                      {
                          "user_id": userId
                      },
                      "id",
                      "name",
                      "type",
                      "hardware_version",
                      "firmware_version",
                      "mac_address",
                      "is_connected",
                      "mesh_id"
                    ]
                  },
                responseType: 'json'
            }).catch(err=>{this.log.error('Error getting graph %s', err)})
            this.log.debug('get device graph response',JSON.stringify(response.data,null,2))
            return response
            }catch(err) {this.log.error('Error retrieving graph %s', err)}
        }, 

        getTimerPrograms: async function(token,device){
          // Get mesh details
          try {  
              this.log.debug('Retrieving schedules')
              const response = await axios({
                  method: 'get',
                  url: endpoint + 'sprinkler_timer_programs?device_id='+device.id,
                  headers: {
                  'Content-Type': 'application/json',
                  'orbit-api-key': token, 
                  'orbit-app-id': 'Bhyve Dashboard'
                  },
                  responseType: 'json'
              }).catch(err=>{this.log.error('Error getting scheduled %s', err)})
              this.log.debug('get timer programs response',JSON.stringify(response.data,null,2))
              return response
              }catch(err) {this.log.error('Error retrieving schedules %s', err)}
          },
    
    startZone: function(token, device, station, runTime){
        try { 
            this.log.debug('startZone', device.id, station, runTime);
            this.wsp.connect(token, device.id)
                .then(ws=>ws.send({
                    event: "change_mode",
                    mode: "manual",
                    device_id: device.id, 
                    stations: [
                        { 
                        "station": station,
                        "run_time": runTime
                        }
                    ]
                }))
        }catch(err) {this.log.error('Error starting zone %s', err)}
    },

    startSchedule: function(token, device, program){
      try { 
          this.log.debug('startZone', device.id, program);
          this.wsp.connect(token, device.id)
              .then(ws=>ws.send({
                  event: "change_mode",
                  mode: "manual",
                  device_id: device.id, 
                  program: program
              }))
      }catch(err) {this.log.error('Error starting zone %s', err)}
  },

    stopZone: function(token, device) {
        try { 
            this.log.debug('stopZone')
            this.wsp.connect(token, device.id)
                .then(ws=>ws.send({
                    event: "change_mode",
                    mode: "manual",
                    device_id: device.id,
                    timestamp: new Date().toISOString()
                }))
        }catch(err) {this.log.error('Error starting zone %s', err)}
    },

    startMultipleZone: function(token, mesh, zones, runTime){
          try { 
            let body=[]
            mesh.devices.forEach((device)=>{
                if(mesh.bridge_device_id!=device.device_id){
                    //zones.forEach((zone,index)=>{
                        //if(zone.enabled){
                        body.push(
                            {
                            device_id: device.ble_device_id,
                            run_time: runTime,
                            station: 1
                            }
                        )
                        //}
                    //})
                }
            })
            this.log.debug('multiple run data',JSON.stringify(body,null,2))
            this.wsp.connect(token, mesh.bridge_device_id)
                .then(ws=>ws.send({
                    event: "change_mode",
                    mode: "manual",
                    device_id: mesh.bridge_device_id,
                    station: body
                }))
        }catch(err) {this.log.error('Error starting multiple zone %s', err)}
    },

    stopDevice: function(token, device){
      try { 
          this.log.debug('stopZone')
          this.wsp.connect(token, device.id)
              .then(ws=>ws.send({
                  event: "change_mode",
                  mode: "manual",
                  device_id: device.id,
                  //stations: [],
                  timestamp: new Date().toISOString()
              }))
      }catch(err) {this.log.error('Error stopping device %s', err)}
  },

    deviceStandby: function(token, device, mode){
        try { 
            this.log.debug('standby')
            this.wsp.connect(token, device.id)
                .then(ws=>ws.send({
                    event: "change_mode",
                    mode: mode,
                    device_id: device.id,
                    timestamp: new Date().toISOString()
                }))
        }catch(err) {this.log.error('Error setting standby %s', err)}
    },

    openConnection:function(token, device){
        try { 
        this.log.debug('Opening WebSocket Connection for %s',device.name)
        this.wsp.connect(token, device.id)
            .then(ws=>ws.send({
                name: device.name,
                id:device.id,
                event: "app_connection",
                orbit_session_token: token
            }))
        }catch(err) {this.log.error('Error opening connection %s', err)}
    },

    onMessage: function(token, device, listner){
        try { 
        this.log.debug('Adding Event Listener for %s',device.name)
        this.wsp.connect(token, device.id)
            .then(ws=>ws.addEventListener('message', msg=>{
                listner(msg.data, device.id)
            }))
        }catch(err) {this.log.error('Error configuring listener %s', err)}
    },

    sync: function(token, device){
        try { 
        this.log.debug('Syncing device %s info', device.name)
        this.wsp.connect(token, device.id)
            .then(ws=>ws.send({
                event: "sync",
                device_id: device.id
            }))
        }catch(err) {this.log.error('Error syncing data %s', err)}
    }

}

class WebSocketProxy {
    constructor(log) {
        this.rws = null
        this.ping = null
        this.log = log
    }

    connect(token, deviceId) {
      if (this.rws) {
          return Promise.resolve(this.rws)
      }

      return new Promise((resolve, reject)=>{
        try {
          this.rws = new reconnectingwebsocket(WS_endpoint+'events', [], {
            WebSocket: ws,
            maxReconnectionDelay: 10000, //64000
            minReconnectionDelay: 1000 + Math.random() * 4000, //2000
            reconnectionDelayGrowFactor: 1.3, //2
            minUptime: 5000,
            connectionTimeout: 4000, //10000
            maxRetries: Infinity,
            maxEnqueuedMessages: Infinity,
            startClosed: false,
            debug: false,
          })

          // Intercept send events for logging
          const origSend = this.rws.send.bind(this.rws)
          this.rws.send = (data, options, callback)=>{
            if (typeof data === 'object') {
                  data = JSON.stringify(data,null,2)
              }
              //this.log.debug(JSON.parse(data).event) //comment line to supress ping info from filling debug log 
              if (JSON.parse(data).event!= 'ping'){ 
                this.log.debug('%s sending %s', deviceId, data) 
              }
              origSend(data, options, callback)
          }

          // Open
          this.rws.addEventListener('open', ()=>{
              this.rws.send({
                  event: 'app_connection',
                  orbit_session_token: token,
                  subscribe_device_id: deviceId
              })
              resolve(this.rws)
          })

          // close
          this.rws.addEventListener('close', msg=>{
              this.log.debug('connection closed', msg)
          })

          // Message
          this.rws.addEventListener('message', msg=>{
              this.log.debug('recieved message', JSON.parse(msg.data))
          })

          // Error
          this.rws.addEventListener('error', msg=>{
              this.log.error('WebSocket Error', msg)
              this.rws.close()
              reject(msg)
          })

          // Ping
          this.ping = setInterval(()=>{
            this.rws.send({ event: 'ping' })
            }, Math.floor(Math.random()*(maxPingInterval-minPingInterval))+minPingInterval)
        
          }catch (error) {
            // Will not execute
            this.log.error('caught', error.message);
          }
      })
    }
}

module.exports = OrbitAPI;