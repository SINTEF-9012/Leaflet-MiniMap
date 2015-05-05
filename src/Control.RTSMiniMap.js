L.Control.RTSMiniMap = L.Control.extend({
	options: {
		position: 'bottomright',
		toggleDisplay: false,
		zoomLevelOffset: -5,
		zoomLevelFixed: false,
		zoomAnimation: false,
		autoToggleDisplay: false,
		width: 150,
		height: 150,
		touchEventMargin: 8,
		clickEventMargin: 4
	},

	hideText: 'Hide MiniMap',

	showText: 'Show MiniMap',

	clear: function() {
		this._points = [];
		this._canvasLayer.redraw();
	},

	addPoint: function(position, color) {
		var point = position;
		if (color) {
			if (!color.a) {
				color.a = 128;
			}
			point._pixelColor = color;
		} else {
			point._pixelColor = {r:255,v:0,b:0,a:128};
		}
		this._points.push(point);
	},

	render: function() {
		if (this._points.length) {
			if (!this._animatedRender) {
				this._miniMap.fitBounds(this._points, {animate:false});
				this._animatedRender = true;
			} else {
				this._miniMap.fitBounds(this._points);
			}
		}
		// Sometimes the fitBounds doesn't change the view
		// so we need to redraw the map manually
		this._canvasLayer.redraw();
	},

	//layer is the map layer to be shown in the minimap
	initialize: function(layer, options) {
		L.Util.setOptions(this, options);
		//Make sure the aiming rects are non-clickable even if the user tries to set them clickable (most likely by forgetting to specify them false)
		this._layer = layer;


		this._points = [];
	},

	onAdd: function(map) {

		this._mainMap = map;

		//Creating the container and stopping events from spilling through to the main map.
		this._container = L.DomUtil.create('div', 'leaflet-control-minimap leaflet-control-minimap-rts');
		this._container.style.width = this.options.width + 'px';
		this._container.style.height = this.options.height + 'px';
		L.DomEvent.disableClickPropagation(this._container);
		L.DomEvent.on(this._container, 'mousewheel', L.Util.bind(this._onMouseWheel, this));
		L.DomEvent.on(this._container, 'dblclick', L.DomEvent.stopPropagation);

		this._miniMap = new L.Map(this._container, {
			attributionControl: false,
			zoomControl: false,
			dragging: false,
			touchZoom: false,
			scrollWheelZoom: false,
			doubleClickZoom: false,
			boxZoom: false,
			crs: map.options.crs,
			fadeAnimation: false,
			zoomAnimation: false,
			markerZoomAnimation: false
		});

		this._miniMap.addLayer(this._layer);

		this._canvasLayer = L.canvas();

		var redrawRequest = null;
		var redrawWorker = L.Util.bind(function() {
			redrawRequest = null;
			this._drawMinimap();
		}, this);

		this._canvasLayer.redraw = L.Util.throttle(function() {
			redrawRequest = redrawRequest ||
				L.Util.requestAnimFrame(redrawWorker);
		}, 200);


		// this._canvasLayer.drawTile = L.Util.bind(this._drawTile, this);
		this._miniMap.addLayer(this._canvasLayer);

		//Keep a record of this to prevent auto toggling when the user explicitly doesn't want it.
		this._userToggledDisplay = false;
		this._minimized = false;

		if (this.options.toggleDisplay) {
			this._addToggleButton();
		}

		this._animatedRender = false;

		this._miniMap.whenReady(L.Util.bind(function() {
			this._mainMap.on('move', this._onMainMapMoving, this);
			this._miniMap.on('contextmenu', function(e) {
			});

			this._miniMap.on('viewreset', function() {
				this._forceProjection = true;
				//console.log("lapin");
			}, this);

			var mouseMoveWorkerId = null,
				lastMouseEvent = null,
				mouseMoveWorker = L.Util.bind(function() {
					mouseMoveWorkerId = null;
					this._onMiniMapDrag(lastMouseEvent);
				}, this);

			var throttledMouseMove = function(e) {
				L.DomEvent.stopPropagation(e);
				lastMouseEvent = e;
				mouseMoveWorkerId = mouseMoveWorkerId || 
					L.Util.requestAnimFrame(mouseMoveWorker);
			};
			this._miniMap.on('mousedown', function(e) {
				this._onMiniMapClick(e);
				L.DomUtil.disableTextSelection();
				L.DomUtil.addClass(this._container, 'mousedown');
				this._stooop = false;
				L.DomEvent.on(this._container, 'mousemove touchmove', throttledMouseMove);
			}, this);
			this._miniMap.on('mouseup mouseout', function() {
				L.DomUtil.enableTextSelection();
				L.DomUtil.removeClass(this._container, 'mousedown');
				L.DomEvent.off(this._container, 'mousemove touchmove', throttledMouseMove);
				//if (this._stickIntervalId) {
				L.Util.cancelAnimFrame(this._stickIntervalId);	
				this._stooop = true;
				//}
			}, this);
			/*this._miniMap.on('mouseout', L.Util.bind(function() {
				if (this._stickIntervalId) {
					window.clearInterval(this._stickIntervalId);	
				}
			}, this));*/


		}, this));

		return this._container;
	},

	addTo: function(map) {
		L.Control.prototype.addTo.call(this, map);
		this._miniMap.setView(this._mainMap.getCenter(), Math.max(this._mainMap.getZoom()-5, 3));
		this._setDisplay(this._decideMinimized());
		return this;
	},

	onRemove: function(map) {
		this._mainMap.off('move', this._onMainMapMoving, this);

		this._miniMap.removeLayer(this._layer);
	},

	_addToggleButton: function() {
		this._toggleDisplayButton = this.options.toggleDisplay ? this._createButton(
			'', this.hideText, 'leaflet-control-minimap-toggle-display', this._container, this._toggleDisplayButtonClicked, this) : undefined;
	},

	_createButton: function(html, title, className, container, fn, context) {
		var link = L.DomUtil.create('a', className, container);
		link.innerHTML = html;
		link.href = '#';
		link.title = title;

		var stop = L.DomEvent.stopPropagation;

		L.DomEvent
			.on(link, 'click', stop)
			.on(link, 'mousedown', stop)
			.on(link, 'dblclick', stop)
			.on(link, 'click', L.DomEvent.preventDefault)
			.on(link, 'click', fn, context);

		return link;
	},

	_toggleDisplayButtonClicked: function() {
		this._userToggledDisplay = true;
		if (!this._minimized) {
			this._minimize();
			this._toggleDisplayButton.title = this.showText;
		} else {
			this._restore();
			this._toggleDisplayButton.title = this.hideText;
		}
	},

	_setDisplay: function(minimize) {
		if (minimize != this._minimized) {
			if (!this._minimized) {
				this._minimize();
			} else {
				this._restore();
			}
		}
	},

	_minimize: function() {
		// hide the minimap
		if (this.options.toggleDisplay) {
			this._container.style.width = '19px';
			this._container.style.height = '19px';
			this._toggleDisplayButton.className += ' minimized';
		} else {
			this._container.style.display = 'none';
		}
		this._minimized = true;
	},

	_restore: function() {
		if (this.options.toggleDisplay) {
			this._container.style.width = this.options.width + 'px';
			this._container.style.height = this.options.height + 'px';
			this._toggleDisplayButton.className = this._toggleDisplayButton.className
				.replace(/(?:^|\s)minimized(?!\S)/g, '');
		} else {
			this._container.style.display = 'block';
		}
		this._minimized = false;
	},

	_onMainMapMoving: function(e) {
		this._canvasLayer.redraw();
	},

	_onMiniMapClick: function(e) {
		var margin = e.type.indexOf("mouse") !== 0 ?
			this.options.touchEventMargin :
			this.options.clickEventMargin;

		margin = 10;
		var topLeft = e.containerPoint.clone(),
			bottomright = e.containerPoint.clone();

		topLeft.x -= margin;
		topLeft.y -= margin;

		bottomright.x += margin;
		bottomright.y += margin;

		var bounds = new L.LatLngBounds(
			this._miniMap.containerPointToLatLng(topLeft),
			this._miniMap.containerPointToLatLng(bottomright));

		var center;

		if (e.latlng) {
			center = e.latlng;
		} else {
			center = this._miniMap.containerPointToLatLng(e.containerPoint);
		}

		//console.log(e.containerPoint);
		this._lastClickPosition = e.containerPoint;

		var average = new L.LatLng(0,0);

		var cpt = 0;
		for (var i = 0, points = this._points, l = points.length; i < l; ++i) {
			var p = points[i];

			if (bounds.contains(p)) {
				//++cpt;
				var distance = Math.sqrt((p.lat - center.lat) * (p.lat - center.lat) +
					(p.lng - center.lng) * (p.lng - center.lng));
				var invDistance = 1/distance || 1;
				average.lat += p.lat * invDistance;
				average.lng += p.lng * invDistance;
				cpt += invDistance;
			}
		}

		if (cpt>0) {

			average.lat /= cpt;
			average.lng /= cpt;
			center = average;
		}

		/*var center;
		if (cpt > 0) {
			average.lat /= cpt;
			average.lng /= cpt;
			center = average;
		} else if (e.latlng) {
			center = e.latlng;
		} else {
			center = this._miniMap.containerPointToLatLng(e.containerPoint);
		}*/

		


		this._mainMap.setView(center, this._mainMap.getZoom(), {
			animate: false
		});
	},

	_onMiniMapDrag: function(e) {
		if (e.touches) {
			if (e.touches.length !== 1) {
				return;
			}

			var first = e.touches[0];
			e.clientX = first.clientX;
			e.clientY = first.clientY;

		}

		e.containerPoint = this._miniMap.mouseEventToContainerPoint(e);

		var diff = e.containerPoint.subtract(this._lastClickPosition);
		
		var coefX = diff.x / this.options.width,
			coefY = diff.y / this.options.height;
		
		var powCoefX = coefX * (1+Math.abs(coefX)*0.3),
			powCoefY = coefY * (1+Math.abs(coefY)*0.3);

		var speed = 100;

		//if (this._stickIntervalId) {
		L.Util.cancelAnimFrame(this._stickIntervalId);	
		//}
		
		var obj = this;
		this._stickIntervalId = L.Util.requestAnimFrame(function roger() {
			obj._mainMap.panBy(L.point(
				speed * powCoefX,
				speed * powCoefY
			), {
				animate: false
			});
			if (!obj._stooop && obj._mainMap.getBounds().intersects(obj._miniMap.getBounds())) {
				obj._stickIntervalId =  L.Util.requestAnimFrame(roger);	
			}
		}, 20);
		/*if (e.containerPoint.x > this.options.width/2) {
			this._lastClickPosition.x = Math.ceil(this.options.width/2);
		}

		if (e.containerPoint.y > this.options.height/2) {
			this._lastClickPosition.y = Math.ceil(this.options.height/2);
		}*/

		//console.log(powCoefX, powCoefY);
		//this._lastClickCenter = e.containerPoint;
		
		//this._onMiniMapClick(e);
	},

	_onMouseWheel: function(e) {
		var delta = L.DomEvent.getWheelDelta(e),
			containerPoint = this._miniMap.mouseEventToContainerPoint(e),
			latlng = this._miniMap.containerPointToLatLng(containerPoint);

		this._mainMap.setView(latlng, this._mainMap.getZoom() + delta);

		L.DomEvent.stopPropagation(e);
	},

	_decideMinimized: function() {
		if (this._userToggledDisplay) {
			return this._minimized;
		}

		if (this.options.autoToggleDisplay) {
			if (this._mainMap.getBounds().contains(this._miniMap.getBounds())) {
				return true;
			}
			return false;
		}

		return this._minimized;
	},

	_drawMinimap: function() {
		var canvasLayer = this._canvasLayer,
			ctx = canvasLayer._ctx,
			ctxWidth = ctx.canvas.width,
			ctxHeight = ctx.canvas.height;

		if (ctxWidth === 0 || ctxHeight === 0) {
			return;
		}

		// Clear the view
		ctx.clearRect(0, 0, ctxWidth, ctxHeight);

		// Compute the view bounds
		var view = this._mainMap.getBounds(),
			viewMax = this._miniMap.latLngToLayerPoint(view.getSouthEast()),
			viewMin = this._miniMap.latLngToLayerPoint(view.getNorthWest()),
			viewWidth = viewMax.x - viewMin.x,
			viewHeight = viewMax.y - viewMin.y;


		ctx.fillStyle = 'rgba(0,0,0,0.33)'
		ctx.fillRect(0, 0, ctxWidth, ctxHeight);
		if (this._miniMap.getBounds().intersects(view) 
				&& viewWidth * viewHeight >= 16) {
			ctx.fillStyle = 'black';
			ctx.shadowBlur = 6;
			ctx.shadowColor = 'rgba(0,0,0,0.5)';
			ctx.globalCompositeOperation = 'source-over';
			ctx.fillRect(viewMin.x, viewMin.y, viewWidth, viewHeight);
		
			ctx.clearRect(viewMin.x, viewMin.y, viewWidth, viewHeight);
			ctx.shadowBlur = 0;
		}

		var canvasData = ctx.getImageData(0, 0, ctxWidth, ctxHeight),
			data = canvasData.data;

		// Draw the points in a oldschool way (ctx.fillRect is not fun enough)
		for (var i = 0, points = this._points, l = points.length; i < l; ++i) {
			var p = points[i];
			var color = p._pixelColor;

			if (this._forceProjection || !p._pos) {
				p._pos = this._miniMap.latLngToLayerPoint(p);
			}

			var pos = p._pos;
	
			ctx.fillStyle = color;
			ctx.fillRect(pos.x-1, pos.y-1, 2, 2);

		}

		this._forceProjection = false;
	}
});

L.Map.mergeOptions({
	miniMapControl: false
});

L.Map.addInitHook(function() {
	if (this.options.miniMapControl) {
		this.miniMapControl = (new L.Control.MiniMap()).addTo(this);
	}
});

L.control.minimap = function(options) {
	return new L.Control.MiniMap(options);
};
