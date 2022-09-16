/* Copyright 2022 PlantQuest Ltd, MIT License */

import L from 'leaflet'

import Pkg from '../package.json'

;(function(W, D) {
  const log = true === window.PLANTQUEST_ASSETMAP_LOG ?
        (...args) => { console.log.apply(null, args) } :
        (...args) => { if('ERROR'===args[1]) { console.log.apply(null, args) } }
        
  const scriptID = (''+Math.random()).substring(2,8)

  log('PQAM','script-load', 'start', 'version=', Pkg.version, 'scriptid=', scriptID)

  if(W.PlantQuestAssetMap) {
    log('PQAM','script-load', 'exists', scriptID, W.PlantQuestAssetMap.id)
    return
  }
  else {
    log('PQAM','script-load', 'create', scriptID)
  }
  
  let $ = D.querySelector.bind(D)
  let $All = D.querySelectorAll.bind(D)
  let Element = D.createElement.bind(D)
  
  function PlantQuestAssetMap() {
    const self = {
      id: (''+Math.random()).substring(2,8),
      config: {
        width: 600,
        height: 400,
        domInterval: 111,
        mapInterval: 111,
        mapBounds: [5850, 7800],
        mapStart: [2925,3900],
        mapStartZoom: -4,
        mapRoomFocusZoom: 0,
        mapMaxZoom: 1,
        mapMinZoom: -4,
        assetFontScaleRoom: 10,
        assetFontScaleZoom: 4,
        assetFontHideZoom: -1,
        colorState: {
          neutral: ['#99f','#33f'],  // lo, hi
          green: ['#99f','#33f'],  // lo, hi; NOTE: same as neutral in this version
          red: ['#f99','#f33'],  // lo, hi
        },
        map: []
      },
      data: {},
      state: {
        started: false,
        room: {},
        asset: {
        },
      },
      listeners: [],
    }

    self.log = function(...args) {
      log('PQAM', ...args)
    }
    
    
    self.start = function(config) {
      if(self.state.started) {
        self.showMap()
        self.clearRoomAssets()
        self.unselectRoom()
        self.map.setView([...self.config.mapStart], self.config.mapStartZoom)
        return
      }
      
      self.state.started = true

      self.config = { ...self.config, ...(config || {}) }
      self.log('start', JSON.stringify(config))
      
      self.config.base = self.config.base || ''

      if(!self.config.base.endsWith('/')) {
        self.config.base += '/'
      }
      
      function loading() {
        self.target = $('#plantquest-assetmap')
        if(!self.target) {
          self.log('ERROR', 'element-id', 'plantquest-assetmap', 'missing')
          clearInterval(loadingInterval)
          return
        }
        
        self.target.style.width = self.config.width
        self.target.style.height = self.config.height
        

        if (null != self.target) {
          clearInterval(loadingInterval)
          self.log('start','target-found',self.target)

          self.log(
            'start','target-size',
            'widthcss',self.config.width,
            'heightcss',self.config.height,
          )
          
          self.load(()=>{
            self.log('start','load-done',self.data)
            
            self.render(()=>{
              self.log('start','render-done')
              
              self.emit({
                srv:'plantquest',
                part:'assetmap',
                state: 'ready'
              })
            })
          })
        }
      }

      const loadingInterval = setInterval(loading, 50)
    }

    
    self.load = function(done) {

      function processData(json) {
        self.data = json
        
        let assetMap = {}
        let assetProps = self.data.assets[0]
        for(let rowI = 1; rowI < self.data.assets.length; rowI++) {
          let row = self.data.assets[rowI]
          let assetID = row[0]
          assetMap[assetID] = assetProps.reduce((a,p,i)=>((a[p]=row[i]),a),{})
        }
        
        self.data.assetMap = assetMap
        
        
        let roomMap = self.data.rooms.reduce((a,r)=>(a[r.room]=r,a),{})
        self.data.roomMap = roomMap
        
        self.log('data loaded')
        done(json)
      }

      if('https://demo.plantquest.app/sample-data.js' === self.config.data) {
        const head = $('head')
        const skript = document.createElement('script')
        skript.setAttribute('src', self.config.data)
        head.appendChild(skript)

        let waiter = setInterval(()=>{
          self.log('loading data...')
          if(window.PLANTQUEST_ASSETMAP_DATA) {
            clearInterval(waiter)
            processData(window.PLANTQUEST_ASSETMAP_DATA)
          }
        },111)
      }
      else {
        // fetch(self.config.base+self.config.data)
        fetch(self.config.data)
          .then(response => {
            if (!response.ok) {
              throw new Error("HTTP error " + response.status)
            }
            return response.json()
          })
          .then(json => processData(json))
          .catch((err)=>self.log('ERROR','load',err))
      }
    }

    
    self.render = function(done) {      
      injectStyle()
      
      let root = Element('div')
      root.style.boxSizing = 'border-box'
      root.style.width = '100%'
      root.style.height = '100%'
      root.style.backgroundColor = 'rgb(203,211,144)'
      root.style.padding = '0px'
      root.style.textAlign = 'center'
      root.style.position = 'relative'
      root.innerHTML = buildContainer()
      self.target.appendChild(root)

      setTimeout(()=>{
        self.vis.map.elem = $('#plantquest-assetmap-map')
        self.build()
        done()
      }, self.domInterval)
    }

    self.send = function(msg) {
      self.log('send', 'in', msg)

      if('room-asset' === msg.relate) {
        self.emit({
          srv:'plantquest',
          part:'assetmap',
          relate:'room-asset',
          relation:clone(self.data.deps.pc.room)
        })        
      }
      else if('map' === msg.show) {
        self.showMap()
      }
      else if('floor' === msg.show) {
        self.showMap()
        self.clearRoomAssets()
        self.unselectRoom()
        self.map.setView([...self.config.mapStart], self.config.mapStartZoom)
      }
      else if('room' === msg.show) {
        let room = self.data.roomMap[msg.room]
        
        if(room) {

          if(msg.assets) {
            if(msg.assets) {
              for(let asset of msg.assets) {
                self.showAssetAlarm(asset.asset, asset.alarm)
              }
            }
          }

          if(msg.focus) {
            self.selectRoom(room.room, {mute:true})
          }
        }
        else {
          self.log('ERROR', 'send', 'room', 'unknown-room', msg)
        }
      }
      else if('asset' === msg.show || 'asset' === msg.hide) {
        let asset = self.data.deps.cp.asset[msg.asset]
        if(asset) {
          self.showAssetAlarm(msg.asset, msg.alarm, 'asset' === msg.hide)
        }
        else {
          self.log('ERROR', 'send', 'asset', 'unknown-asset', msg)
        }
      }
    }

    self.listen = function(listener) {
      if(null == listener || 'function' !== typeof(listener)) {
        self.log('ERROR', 'listen', 'bad-listener', listener)
                 
      }
      else {
        self.listeners.push(listener)
        self.log('listen', 'set-listener',
                 '<<'+listener.toString()
                 .substring(0,77).replace(/[\r\n]/g,'')+'...>>')
      }
    }

    
    self.click = function(what, event) {
      event && event.stopPropagation()
      let msg = Object.assign({
        srv:'plantquest',
        part:'assetmap',
      }, what)
      self.log('click',msg)
      self.emit(msg)
    }

    
    self.emit = function(msg) {
      self.log('send', msg)
      self.listeners.forEach(listener=>{
        try {
          listener(msg)
        }
        catch(e) {
          self.log('ERROR', 'emit', 'listener', e, msg, listener)
        }
      })
    }


    self.vis = {
      map: {
      },
      ctrl: {
      }
    }
    

    self.loc = {
      x: 0,
      y: 0,
      poly: null,
      room: null,
      chosen: {
        poly: null,
        room: null,
      },
      alarmShown: {},
      asset: {},
      level: 'Ground Floor',
    }

    self.map = null
    self.layer = {}

    
    self.build = function() {
      let ms = {
        mapurl: self.config.map[0],
        bounds: [[0, 0], [...self.config.mapBounds]]
      }

      self.log('build', ms, L)
      
      self.map = L.map('plantquest-assetmap-map', {
        crs: L.CRS.Simple,
        scrollWheelZoom: true,
        attributionControl: false,
        minZoom: self.config.mapMinZoom,
        maxZoom: self.config.mapMaxZoom,
      })

      self.map.on('zoomstart', self.zoomStartRender)
      self.map.on('zoomend', self.zoomEndRender)
      
      setTimeout(()=>{
        self.map.setView([...self.config.mapStart], self.config.mapStartZoom)
      },self.config.mapInterval/2)

      L.imageOverlay(ms.mapurl, ms.bounds).addTo(self.map);

      self.layer.room = L.layerGroup().addTo(self.map)
      self.layer.asset = L.layerGroup().addTo(self.map)
      
      self.map.on('mousemove', (mev)=>{
        self.loc.x = mev.latlng.lng
        self.loc.y = mev.latlng.lat
      })
      
      setInterval(self.checkRooms, self.config.mapInterval)
    }


    self.zoomStartRender = function() {
      let zoom = self.map.getZoom()
      if(null == zoom) return;
    }


    self.zoomEndRender = function() {
      let zoom = self.map.getZoom()
      if(null == zoom) return;
      
      if(self.config.assetFontHideZoom < zoom) {
        let assetFontSize = self.config.assetFontScaleRoom +
          (zoom * self.config.assetFontScaleZoom)        

        let assetFontSizePts = assetFontSize+'pt'
      
        $All('.plantquest-assetmap-asset-label-green')
          .forEach(label => {
            label.style.display='block'
          })
        $All('.plantquest-assetmap-asset-label-red')
          .forEach(label => {
            label.style.display='block'
          })
      }
      else {
        $All('.plantquest-assetmap-asset-label-green')
          .forEach(label => {
            label.style.display='none'
          })
        $All('.plantquest-assetmap-asset-label-red')
          .forEach(label => {
            label.style.display='none'
          })
      }
    }
    
    
    self.checkRooms = function() {
      let xco = self.loc.x
      let yco = self.loc.y
      
      let rooms = Object.values(self.data.rooms)

      for(let room of rooms) {
        if(self.loc.level !== room.level) {
          continue
        }
        
        let alarmState = self.state.room[room.room] ?
            self.state.room[room.room].alarm : null

        let inside = room.poly && pointInPolygon([yco,xco], room.poly)
        let alreadyShown = room === self.loc.room || room === self.loc.chosen.room
        let drawRoom = inside && !alreadyShown && 'red' !== alarmState

        
        if(!drawRoom && !inside && self.loc.room === room) {
          if(self.loc.poly) {
            self.loc.poly.remove(self.layer.room)
            self.loc.room = null
          }
        }
        else if(drawRoom) {
          if(self.loc.poly) {
            self.loc.poly.remove(self.layer.room)
            self.loc.room = null
          }
          
          try {
            let roomState = self.state.room[room.room] ||
                (self.state.room[room.room]={alarm:'neutral'})

            self.loc.room = room
            self.loc.alarmState = alarmState

            self.loc.poly = L.polygon(
              room.poly, {
                color: self.resolveColor(roomState.alarm,'lo')
              })

            self.loc.poly.on('click', ()=>self.selectRoom(room.room))
            
            self.loc.poly.addTo(self.layer.room)
          }
          catch(e) {
            self.log('ERROR','map','1020', e.message, e)
          }
        }
      }
    }        


    self.selectRoom = function(roomId,opts) {
      opts = opts || {}
      try {
        let room = self.data.roomMap[roomId]
        let isChosen = self.loc.chosen.room && roomId === self.loc.chosen.room.room
        
        if(null == self.data.roomMap[roomId] || isChosen) {
          self.focusRoom(self.loc.chosen.room)
          return
        }

        self.log('selectRoom', roomId)
                
        let roomState = self.state.room[room.room] ||
            (self.state.room[room.room]={alarm:'neutral'})

        if(self.loc.poly) {
          self.loc.poly.remove(self.layer.room)
          self.loc.poly = null
        }
        self.loc.room = null

        if(self.loc.chosen.poly && room !== self.loc.chosen.room) {
          let prevRoom = self.loc.chosen.room
          let prevRoomState = self.state.room[prevRoom.room] ||
              (self.state.room[prevRoom.room]={alarm:'neutral'})

          if('red'===prevRoomState.alarm) {
            self.loc.chosen.poly.setStyle({
              color: self.resolveColor(prevRoomState.alarm,'lo')
            })
            self.loc.alarmShown[prevRoom.room].poly = self.loc.chosen.poly
          }
          else {
            self.loc.chosen.poly.remove(self.layer.room)
            self.loc.chosen.poly = null
          }
        }

        if(self.loc.popup) {
          self.loc.popup.remove(self.map)
          self.loc.popop = null
        }

        self.loc.chosen.room = room


        if('red' === roomState.alarm) {
          let alarmShown = self.loc.alarmShown[room.room] ||
              (self.loc.alarmShown[room.room]= {})
          if(alarmShown.poly) {
            alarmShown.poly.setStyle({
              color: self.resolveColor(roomState.alarm,'hi')
            })
            self.loc.chosen.poly = alarmShown.poly
          }
        }
        else {
        
          self.loc.chosen.poly = L.polygon(
            room.poly, {
              color: self.resolveColor(roomState.alarm,'hi')
            })
          self.loc.chosen.poly.on('click', ()=>self.selectRoom(room.room))
          
          self.loc.chosen.poly.addTo(self.layer.room)
        }

        let roomlatlng = self.focusRoom(room)
               
        self.loc.popup = L.popup({
          autoClose: false,
          closeOnClick: false,
        })
          .setLatLng(roomlatlng)
          .setContent(self.roomPopup(self.loc.chosen.room))
          .openOn(self.map)

        self.map.setView([roomlatlng[0]-50,roomlatlng[1]+50],
                         self.config.mapRoomFocusZoom)

        self.showRoomAssets(room.room)
        self.clearRoomAssets(room.room)
        self.zoomEndRender()
        
        if(!opts.mute) {
          self.click({select:'room', room:self.loc.chosen.room.room})
        }
      }
      catch(e) {
        self.log('ERROR','selectRoom','1010', roomId, e.message, e)
      }
    }


    self.unselectRoom = function() {
      let prevRoom = self.loc.chosen.room
      if(prevRoom) {
        self.loc.chosen.room = null
        let prevRoomState = self.state.room[prevRoom.room] ||
            (self.state.room[prevRoom.room]={alarm:'neutral'})
      
        if('red'===prevRoomState.alarm) {
          self.loc.chosen.poly.setStyle({
            color: self.resolveColor(prevRoomState.alarm,'lo')
          })
          self.loc.alarmShown[prevRoom.room].poly = self.loc.chosen.poly
        }
        else {
          self.loc.chosen.poly.remove(self.layer.room)
        }

        self.loc.chosen.poly = null

        if(self.loc.popup) {
          self.loc.popup.remove(self.map)
          self.loc.popop = null
        }
      }
    }

    
    self.focusRoom = function(room) {
      if(null == room) return;
      
      let roomlatlng = [0,0]
      for(let point of room.poly) {
        if(point[0] > roomlatlng[0]) {
          roomlatlng[0] = point[0]
          roomlatlng[1] = point[1]
        }
      }

      let roompos = [roomlatlng[0],roomlatlng[1]-30]
      self.map.setView(roompos, self.config.mapRoomFocusZoom)
      self.zoomEndRender()
      
      return roomlatlng
    }

    
    self.showRoomAlarm = function(room, alarm) {
      self.log('showRoomAlarm', room, alarm)
      room = 'string' === typeof room ? self.data.roomMap[room] : room
      
      try {
        if('green' === alarm && self.roomHasAssetAlarms(room.room,'red')) {
          alarm = 'red'
        }

        let roomState =
            self.state.room[room.room] ||
            (self.state.room[room.room]={})

        roomState.alarm = alarm

        let alarmShown = self.loc.alarmShown[room.room] ||
            (self.loc.alarmShown[room.room]= {})

        if(room === self.loc.chosen.room) {
          if(self.loc.chosen.poly) {
            self.loc.chosen.poly.setStyle({
              color: self.resolveColor(roomState.alarm,'hi')
            })
          }
        }
        else {
          if(alarmShown.poly) {
            alarmShown.poly.remove(self.layer.room)
            alarmShown.poly = null
          }
            
          if('red' === alarm) {
            alarmShown.poly = L.polygon(
              room.poly, {
                color: self.resolveColor(roomState.alarm,'lo')
              })
            alarmShown.poly.addTo(self.layer.room)
            alarmShown.poly.on('click', ()=>self.selectRoom(room.room))
          }
        }
        
      }
      catch(e) {
        self.log('ERROR','map','showRoomAlarm','1040', e.message, e)
      }
    }

    
    self.roomHasAssetAlarms = function(roomID, kind) {
      let assets = (self.data.deps.pc.room[roomID] ?
                    self.data.deps.pc.room[roomID].asset : []) || []
      for(let assetID of assets) {
        let assetState = self.state.asset[assetID]
        if(assetState && kind === assetState.alarm) {
          return true
        }
      }

      return false
    }
    

    self.showAssetAlarm = function(assetID, alarm, hide) {
      let assetProps = self.data.assetMap[assetID]
      self.log('showAssetAlarm', assetID, alarm, 'hide', hide, assetProps)
      
      if(null == assetProps) {
        return
      }
      
      let assetState = self.state.asset[assetID] || (self.state.asset[assetID]={})
      alarm = assetState.alarm = alarm || assetState.alarm || 'green'
 
      if(assetState.poly) {
        assetState.poly.remove(self.layer.asset)
        assetState.poly = null
      }

      if(assetState.label) {
        assetState.label.remove(self.layer.asset)
        assetState.label = null
      }


      self.showRoomAlarm(assetProps.room, alarm)

      
      
      // Only draw polys if room is chosen or not hiding
      if(hide ||
         (null == self.loc.chosen.room ||
          assetProps.room !== self.loc.chosen.room.room))
      {
        return
      }
      
      
      let assetPoint = [
        self.config.mapBounds[0]-assetProps.yco,
        assetProps.xco,
      ]
      let ax = assetPoint[1]
      let ay = assetPoint[0]
      
      assetState.alarm = alarm
      let color = '#696'
      
      if('red' === alarm) {
        color = '#f66'
        assetState.poly = L.polygon([
          [ay+10,ax],
          [ay-10,ax+10],
          [ay-10,ax-10],
        ], {
          color: color,
        })
      }
      else {
        assetState.poly = L.circle(
          assetPoint, {
            radius: 5,
            color: color,
          })
      }

      assetState.poly.addTo(self.layer.asset)

      assetState.label = L.marker([ay-20,ax-20], {icon: L.divIcon({
        className: 'plantquest-assetmap-asset-label plantquest-assetmap-asset-label-'+alarm,
        html: assetID
      })})

      assetState.label.addTo(self.layer.asset)

      let lem = assetState.label.getElement()
      lem.style.width = ''
      lem.style.height = ''
      lem.style.fontSize = ''
      
      self.zoomEndRender()
    }


    self.clearRoomAssets = function(roomID) {
      for(let assetID in self.state.asset) {
        let assetState = self.state.asset[assetID]
        if(self.data.deps.cp.asset[assetID].room !== roomID) {
          if(assetState.poly) {
            assetState.poly.remove(self.layer.asset)
          }
          if(assetState.label) {
            assetState.label.remove(self.layer.asset)
          }
        }
      }
    }

    
    self.showRoomAssets = function(roomID) {
      let assets = (self.data.deps.pc.room[roomID] ?
                    self.data.deps.pc.room[roomID].asset : []) || []

      for(let assetID of assets) {
        let assetState = self.state.asset[assetID]
        if(assetState && assetState.alarm) {
          self.showAssetAlarm(assetID, assetState.alarm)
        }
      }
    }

    
    self.showMap = function() {
    }

    
    self.resolveColor = function(stateName, hilo) {
      stateName = self.config.colorState[stateName] ? stateName : 'neutral'
      let colorHilo = 'hi' === hilo ? 1 : 0
      let color = self.config.colorState[stateName][colorHilo]
      return color
    }
    

    self.roomPopup = function(room, msg) {
      let html = []

      html.push(
        '<h2>',
        room.room,
        '</h2>'
      )

      return html.join('\n')
    }

    
    self.getRoomAssets = function(roomID) {
      let assets = []
      let roomMap = self.data.deps.pc.room
      let roomEntry = roomMap[roomID]
      assets = roomEntry && roomEntry.asset ? roomEntry.asset.map(a=>({
        asset: a
      })) : assets
      return assets
    }

    
    function buildContainer() {
      let html = [
        '<div id="plantquest-assetmap-map" class="plantquest-assetmap-vis"></div>',
      ]      
      return html.join('')
    }

    return self
  }

  
  function fixid(idstr) {
    return idstr.replace(/[ \t]/g, '-')
  }
  
  function clear() {
  }
  
  function clone(obj) {
    if(null != obj && 'object' === typeof obj) {
      return JSON.parse(JSON.stringify(obj))
    }
    return obj
  }


  // pointInPolygon
  // The MIT License (MIT) Copyright (c) 2016 James Halliday
  // See https://github.com/substack/point-in-polygon
  
  function pointInPolygon (point, vs, start, end) {
    if (vs.length > 0 && Array.isArray(vs[0])) {
      return pointInPolygonNested(point, vs, start, end)
    } else {
      return pointInPolygonFlat(point, vs, start, end)
    }
  }

  function pointInPolygonFlat (point, vs, start, end) {
    let x = point[0], y = point[1]
    let inside = false
    if (start === undefined) start = 0
    if (end === undefined) end = vs.length
    let len = (end-start)/2
    for (let i = 0, j = len - 1; i < len; j = i++) {
      let xi = vs[start+i*2+0], yi = vs[start+i*2+1]
      let xj = vs[start+j*2+0], yj = vs[start+j*2+1]
      let intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }
  
  function pointInPolygonNested (point, vs, start, end) {
    let x = point[0], y = point[1]
    let inside = false
    if (start === undefined) start = 0
    if (end === undefined) end = vs.length
    let len = end - start
    for (let i = 0, j = len - 1; i < len; j = i++) {
      let xi = vs[i+start][0], yi = vs[i+start][1]
      let xj = vs[j+start][0], yj = vs[j+start][1]
      let intersect = ((yi > y) !== (yj > y))
          && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
      if (intersect) inside = !inside
    }
    return inside
  }
    
  W.PlantQuestAssetMap = new PlantQuestAssetMap()


  function injectStyle() {
    const head = $('head')
    const style = document.createElement('style')
    style.innerHTML = `

#plantquest-assetmap {
    background-color: rgb(203,211,144);
}

#plantquest-assetmap-map {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    background-color: rgb(203,211,144);
}


div.plantquest-assetmap-vis {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 100;
}


img.plantquest-assetmap-logo {
    cursor: pointer;
}


div.plantquest-assetmap-asset-label {
    width: 96px;
    height: 48px;
    font-size: 16px;
    overflow: hidden;
}

div.plantquest-assetmap-asset-label-green {
    xcolor: #696;
    color: white;
    border: 2px solid #696;
    border-radius: 4px;
    background-color: rgba(102,153,102,0.2);
}

div.plantquest-assetmap-asset-label-red {
    xcolor: #f66;
    color: white;
    border: 2px solid #f66;
    border-radius: 4px;
    background-color: rgba(255,102,102,0.2);
}





/* 
 * Leaflet 1.8.0, a JS library for interactive maps. https://leafletjs.com
 * (c) 2010-2022 Vladimir Agafonkin, (c) 2010-2011 CloudMade
 * BSD 2-Clause License, See https://leafletjs.com/
 */


.leaflet-pane,
.leaflet-tile,
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-tile-container,
.leaflet-pane > svg,
.leaflet-pane > canvas,
.leaflet-zoom-box,
.leaflet-image-layer,
.leaflet-layer {
    position: absolute;
    left: 0;
    top: 0;
}
.leaflet-container {
    overflow: hidden;
}
.leaflet-tile,
.leaflet-marker-icon,
.leaflet-marker-shadow {
    -webkit-user-select: none;
    -moz-user-select: none;
    user-select: none;
    -webkit-user-drag: none;
}
/* Prevents IE11 from highlighting tiles in blue */
.leaflet-tile::selection {
    background: transparent;
}
/* Safari renders non-retina tile on retina better with this, but Chrome is worse */
.leaflet-safari .leaflet-tile {
    image-rendering: -webkit-optimize-contrast;
}
/* hack that prevents hw layers "stretching" when loading new tiles */
.leaflet-safari .leaflet-tile-container {
    width: 1600px;
    height: 1600px;
    -webkit-transform-origin: 0 0;
}
.leaflet-marker-icon,
.leaflet-marker-shadow {
    display: block;
}
/* .leaflet-container svg: reset svg max-width decleration shipped in Joomla! (joomla.org) 3.x */
/* .leaflet-container img: map is broken in FF if you have max-width: 100% on tiles */
.leaflet-container .leaflet-overlay-pane svg,
.leaflet-container .leaflet-marker-pane img,
.leaflet-container .leaflet-shadow-pane img,
.leaflet-container .leaflet-tile-pane img,
.leaflet-container img.leaflet-image-layer,
.leaflet-container .leaflet-tile {
    max-width: none !important;
    max-height: none !important;
}

.leaflet-container.leaflet-touch-zoom {
    -ms-touch-action: pan-x pan-y;
    touch-action: pan-x pan-y;
}
.leaflet-container.leaflet-touch-drag {
    -ms-touch-action: pinch-zoom;
    /* Fallback for FF which doesn't support pinch-zoom */
    touch-action: none;
    touch-action: pinch-zoom;
}
.leaflet-container.leaflet-touch-drag.leaflet-touch-zoom {
    -ms-touch-action: none;
    touch-action: none;
}
.leaflet-container {
    -webkit-tap-highlight-color: transparent;
}
.leaflet-container a {
    -webkit-tap-highlight-color: rgba(51, 181, 229, 0.4);
}
.leaflet-tile {
    filter: inherit;
    visibility: hidden;
}
.leaflet-tile-loaded {
    visibility: inherit;
}
.leaflet-zoom-box {
    width: 0;
    height: 0;
    -moz-box-sizing: border-box;
    box-sizing: border-box;
    z-index: 800;
}
/* workaround for https://bugzilla.mozilla.org/show_bug.cgi?id=888319 */
.leaflet-overlay-pane svg {
    -moz-user-select: none;
}

.leaflet-pane         { z-index: 400; }

.leaflet-tile-pane    { z-index: 200; }
.leaflet-overlay-pane { z-index: 400; }
.leaflet-shadow-pane  { z-index: 500; }
.leaflet-marker-pane  { z-index: 600; }
.leaflet-tooltip-pane   { z-index: 650; }
.leaflet-popup-pane   { z-index: 700; }

.leaflet-map-pane canvas { z-index: 100; }
.leaflet-map-pane svg    { z-index: 200; }

.leaflet-vml-shape {
    width: 1px;
    height: 1px;
}
.lvml {
    behavior: url(#default#VML);
    display: inline-block;
    position: absolute;
}


/* control positioning */

.leaflet-control {
    position: relative;
    z-index: 800;
    pointer-events: visiblePainted; /* IE 9-10 doesn't have auto */
    pointer-events: auto;
}
.leaflet-top,
.leaflet-bottom {
    position: absolute;
    z-index: 1000;
    pointer-events: none;
}
.leaflet-top {
    top: 0;
}
.leaflet-right {
    right: 0;
}
.leaflet-bottom {
    bottom: 0;
}
.leaflet-left {
    left: 0;
}
.leaflet-control {
    float: left;
    clear: both;
}
.leaflet-right .leaflet-control {
    float: right;
}
.leaflet-top .leaflet-control {
    margin-top: 10px;
}
.leaflet-bottom .leaflet-control {
    margin-bottom: 10px;
}
.leaflet-left .leaflet-control {
    margin-left: 10px;
}
.leaflet-right .leaflet-control {
    margin-right: 10px;
}


/* zoom and fade animations */

.leaflet-fade-anim .leaflet-tile {
    will-change: opacity;
}
.leaflet-fade-anim .leaflet-popup {
    opacity: 0;
    -webkit-transition: opacity 0.2s linear;
    -moz-transition: opacity 0.2s linear;
    transition: opacity 0.2s linear;
}
.leaflet-fade-anim .leaflet-map-pane .leaflet-popup {
    opacity: 1;
}
.leaflet-zoom-animated {
    -webkit-transform-origin: 0 0;
    -ms-transform-origin: 0 0;
    transform-origin: 0 0;
}
.leaflet-zoom-anim .leaflet-zoom-animated {
    will-change: transform;
}
.leaflet-zoom-anim .leaflet-zoom-animated {
    -webkit-transition: -webkit-transform 0.25s cubic-bezier(0,0,0.25,1);
    -moz-transition:    -moz-transform 0.25s cubic-bezier(0,0,0.25,1);
    transition:         transform 0.25s cubic-bezier(0,0,0.25,1);
}
.leaflet-zoom-anim .leaflet-tile,
.leaflet-pan-anim .leaflet-tile {
    -webkit-transition: none;
    -moz-transition: none;
    transition: none;
}

.leaflet-zoom-anim .leaflet-zoom-hide {
    visibility: hidden;
}


/* cursors */

.leaflet-interactive {
    cursor: pointer;
}
.leaflet-grab {
    cursor: -webkit-grab;
    cursor:    -moz-grab;
    cursor:         grab;
}
.leaflet-crosshair,
.leaflet-crosshair .leaflet-interactive {
    cursor: crosshair;
}
.leaflet-popup-pane,
.leaflet-control {
    cursor: auto;
}
.leaflet-dragging .leaflet-grab,
.leaflet-dragging .leaflet-grab .leaflet-interactive,
.leaflet-dragging .leaflet-marker-draggable {
    cursor: move;
    cursor: -webkit-grabbing;
    cursor:    -moz-grabbing;
    cursor:         grabbing;
}

/* marker & overlays interactivity */
.leaflet-marker-icon,
.leaflet-marker-shadow,
.leaflet-image-layer,
.leaflet-pane > svg path,
.leaflet-tile-container {
    pointer-events: none;
}

.leaflet-marker-icon.leaflet-interactive,
.leaflet-image-layer.leaflet-interactive,
.leaflet-pane > svg path.leaflet-interactive,
svg.leaflet-image-layer.leaflet-interactive path {
    pointer-events: visiblePainted; /* IE 9-10 doesn't have auto */
    pointer-events: auto;
}

/* visual tweaks */

.leaflet-container {
    background: #ddd;
    outline: 0;
}
.leaflet-container a {
    color: #0078A8;
}
.leaflet-container a.leaflet-active {
    outline: 2px solid orange;
}
.leaflet-zoom-box {
    border: 2px dotted #38f;
    background: rgba(255,255,255,0.5);
}


/* general typography */
.leaflet-container {
    font: 12px/1.5 "Helvetica Neue", Arial, Helvetica, sans-serif;
}


/* general toolbar styles */

.leaflet-bar {
    box-shadow: 0 1px 5px rgba(0,0,0,0.65);
    border-radius: 4px;
}
.leaflet-bar a,
.leaflet-bar a:hover {
    background-color: #fff;
    border-bottom: 1px solid #ccc;
    width: 26px;
    height: 26px;
    line-height: 26px;
    display: block;
    text-align: center;
    text-decoration: none;
    color: black;
}
.leaflet-bar a,
.leaflet-control-layers-toggle {
    background-position: 50% 50%;
    background-repeat: no-repeat;
    display: block;
}
.leaflet-bar a:hover {
    background-color: #f4f4f4;
}
.leaflet-bar a:first-child {
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
}
.leaflet-bar a:last-child {
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
    border-bottom: none;
}
.leaflet-bar a.leaflet-disabled {
    cursor: default;
    background-color: #f4f4f4;
    color: #bbb;
}

.leaflet-touch .leaflet-bar a {
    width: 30px;
    height: 30px;
    line-height: 30px;
}
.leaflet-touch .leaflet-bar a:first-child {
    border-top-left-radius: 2px;
    border-top-right-radius: 2px;
}
.leaflet-touch .leaflet-bar a:last-child {
    border-bottom-left-radius: 2px;
    border-bottom-right-radius: 2px;
}

/* zoom control */

.leaflet-control-zoom-in,
.leaflet-control-zoom-out {
    font: bold 18px 'Lucida Console', Monaco, monospace;
    text-indent: 1px;
}

.leaflet-touch .leaflet-control-zoom-in, .leaflet-touch .leaflet-control-zoom-out  {
    font-size: 22px;
}


/* layers control */

.leaflet-control-layers {
    box-shadow: 0 1px 5px rgba(0,0,0,0.4);
    background: #fff;
    border-radius: 5px;
}
.leaflet-control-layers-toggle {
    background-image: url(images/layers.png);
    width: 36px;
    height: 36px;
}
.leaflet-retina .leaflet-control-layers-toggle {
    background-image: url(images/layers-2x.png);
    background-size: 26px 26px;
}
.leaflet-touch .leaflet-control-layers-toggle {
    width: 44px;
    height: 44px;
}
.leaflet-control-layers .leaflet-control-layers-list,
.leaflet-control-layers-expanded .leaflet-control-layers-toggle {
    display: none;
}
.leaflet-control-layers-expanded .leaflet-control-layers-list {
    display: block;
    position: relative;
}
.leaflet-control-layers-expanded {
    padding: 6px 10px 6px 6px;
    color: #333;
    background: #fff;
}
.leaflet-control-layers-scrollbar {
    overflow-y: scroll;
    overflow-x: hidden;
    padding-right: 5px;
}
.leaflet-control-layers-selector {
    margin-top: 2px;
    position: relative;
    top: 1px;
}
.leaflet-control-layers label {
    display: block;
}
.leaflet-control-layers-separator {
    height: 0;
    border-top: 1px solid #ddd;
    margin: 5px -10px 5px -6px;
}

/* Default icon URLs */
.leaflet-default-icon-path {
    background-image: url(images/marker-icon.png);
}


/* attribution and scale controls */

.leaflet-container .leaflet-control-attribution {
    background: #fff;
    background: rgba(255, 255, 255, 0.7);
    margin: 0;
}
.leaflet-control-attribution,
.leaflet-control-scale-line {
    padding: 0 5px;
    color: #333;
}
.leaflet-control-attribution a {
    text-decoration: none;
}
.leaflet-control-attribution a:hover {
    text-decoration: underline;
}
.leaflet-container .leaflet-control-attribution,
.leaflet-container .leaflet-control-scale {
    font-size: 11px;
}
.leaflet-left .leaflet-control-scale {
    margin-left: 5px;
}
.leaflet-bottom .leaflet-control-scale {
    margin-bottom: 5px;
}
.leaflet-control-scale-line {
    border: 2px solid #777;
    border-top: none;
    line-height: 1.1;
    padding: 2px 5px 1px;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    -moz-box-sizing: border-box;
    box-sizing: border-box;

    background: #fff;
    background: rgba(255, 255, 255, 0.5);
}
.leaflet-control-scale-line:not(:first-child) {
    border-top: 2px solid #777;
    border-bottom: none;
    margin-top: -2px;
}
.leaflet-control-scale-line:not(:first-child):not(:last-child) {
    border-bottom: 2px solid #777;
}

.leaflet-touch .leaflet-control-attribution,
.leaflet-touch .leaflet-control-layers,
.leaflet-touch .leaflet-bar {
    box-shadow: none;
}
.leaflet-touch .leaflet-control-layers,
.leaflet-touch .leaflet-bar {
    border: 2px solid rgba(0,0,0,0.2);
    background-clip: padding-box;
}


/* popup */

.leaflet-popup {
    position: absolute;
    text-align: center;
    margin-bottom: 20px;
}
.leaflet-popup-content-wrapper {
    padding: 1px;
    text-align: left;
    border-radius: 12px;
}
.leaflet-popup-content {
    margin: 13px 19px;
    line-height: 1.4;
}
.leaflet-popup-content p {
    margin: 18px 0;
}
.leaflet-popup-tip-container {
    width: 40px;
    height: 20px;
    position: absolute;
    left: 50%;
    margin-left: -20px;
    overflow: hidden;
    pointer-events: none;
}
.leaflet-popup-tip {
    width: 17px;
    height: 17px;
    padding: 1px;

    margin: -10px auto 0;

    -webkit-transform: rotate(45deg);
    -moz-transform: rotate(45deg);
    -ms-transform: rotate(45deg);
    transform: rotate(45deg);
}
.leaflet-popup-content-wrapper,
.leaflet-popup-tip {
    background: white;
    color: #333;
    box-shadow: 0 3px 14px rgba(0,0,0,0.4);
}
.leaflet-container a.leaflet-popup-close-button {
    position: absolute;
    top: 0;
    right: 0;
    padding: 4px 4px 0 0;
    border: none;
    text-align: center;
    width: 18px;
    height: 14px;
    font: 16px/14px Tahoma, Verdana, sans-serif;
    color: #c3c3c3;
    text-decoration: none;
    font-weight: bold;
    background: transparent;
}
.leaflet-container a.leaflet-popup-close-button:hover {
    color: #999;
}
.leaflet-popup-scrolled {
    overflow: auto;
    border-bottom: 1px solid #ddd;
    border-top: 1px solid #ddd;
}

.leaflet-oldie .leaflet-popup-content-wrapper {
    -ms-zoom: 1;
}
.leaflet-oldie .leaflet-popup-tip {
    width: 24px;
    margin: 0 auto;

    -ms-filter: "progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678)";
    filter: progid:DXImageTransform.Microsoft.Matrix(M11=0.70710678, M12=0.70710678, M21=-0.70710678, M22=0.70710678);
}
.leaflet-oldie .leaflet-popup-tip-container {
    margin-top: -1px;
}

.leaflet-oldie .leaflet-control-zoom,
.leaflet-oldie .leaflet-control-layers,
.leaflet-oldie .leaflet-popup-content-wrapper,
.leaflet-oldie .leaflet-popup-tip {
    border: 1px solid #999;
}


/* div icon */

.leaflet-div-icon {
    background: #fff;
    border: 1px solid #666;
}


/* Tooltip */
/* Base styles for the element that has a tooltip */
.leaflet-tooltip {
    position: absolute;
    padding: 6px;
    background-color: #fff;
    border: 1px solid #fff;
    border-radius: 3px;
    color: #222;
    white-space: nowrap;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    pointer-events: none;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
.leaflet-tooltip.leaflet-clickable {
    cursor: pointer;
    pointer-events: auto;
}
.leaflet-tooltip-top:before,
.leaflet-tooltip-bottom:before,
.leaflet-tooltip-left:before,
.leaflet-tooltip-right:before {
    position: absolute;
    pointer-events: none;
    border: 6px solid transparent;
    background: transparent;
    content: "";
}

/* Directions */

.leaflet-tooltip-bottom {
    margin-top: 6px;
}
.leaflet-tooltip-top {
    margin-top: -6px;
}
.leaflet-tooltip-bottom:before,
.leaflet-tooltip-top:before {
    left: 50%;
    margin-left: -6px;
}
.leaflet-tooltip-top:before {
    bottom: 0;
    margin-bottom: -12px;
    border-top-color: #fff;
}
.leaflet-tooltip-bottom:before {
    top: 0;
    margin-top: -12px;
    margin-left: -6px;
    border-bottom-color: #fff;
}
.leaflet-tooltip-left {
    margin-left: -6px;
}
.leaflet-tooltip-right {
    margin-left: 6px;
}
.leaflet-tooltip-left:before,
.leaflet-tooltip-right:before {
    top: 50%;
    margin-top: -6px;
}
.leaflet-tooltip-left:before {
    right: 0;
    margin-right: -12px;
    border-left-color: #fff;
}
.leaflet-tooltip-right:before {
    left: 0;
    margin-left: -12px;
    border-right-color: #fff;
}

`
    head.appendChild(style)
  }
  
})(window, document);

