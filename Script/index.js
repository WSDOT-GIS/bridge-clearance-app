/*global require*/
require(["esri/map", "esri/config", "esri/layers/FeatureLayer", "esri/tasks/query", "esri/symbols/SimpleLineSymbol", "esri/symbols/SimpleMarkerSymbol"], function (Map, esriConfig, FeatureLayer, Query, SimpleLineSymbol, SimpleMarkerSymbol) {
	var map, bridgeLayer, ucNoDataLayer;

	esriConfig.defaults.io.proxyUrl = "proxy/proxy.ashx";

	map = new Map("map", {
		basemap: "gray",
		center: [-120.80566406246835, 47.41322033015946],
		zoom: 7,
		showAttribution: true
	});

	function onLayerError(error) {
		console.error("Layer error", error);
	}

	function FeetAndInches(str) {
		var feetAndInRe = /(\d+)'\s*(\d+(?:\.\d+)?)"/i;
		var match = str.match(feetAndInRe);
		if (!match) {
			throw new Error("Invalid format.");
		} 
		this.feet = Number(match[1]);
		this.inches = Number(match[2]);
	}

	FeetAndInches.prototype.totalInches = function () {
		return this.feet * 12 + this.inches;
	};

	FeetAndInches.prototype.totalFeet = function () {
		return this.feet + this.inches / 12;
	};

	map.on("load", function () {
		var lineSelectionSymbol = new SimpleLineSymbol({
			type: "esriSLS",
			style: "esriSLSSolid",
			color: [255, 0, 0, 255],
			width: 15
		});
		var pointSelectionSymbol = new SimpleMarkerSymbol({
			"type": "esriSMS",
			"style": "esriSMSSquare",
			"color": [255, 0, 0, 255],
			"size": 8,
			"angle": 0,
			"xoffset": 0,
			"yoffset": 0,
			"outline": {
				"color": [40, 0, 0, 255],
				"width": 2
			 }
		});

		bridgeLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeService_demo/MapServer/2", {
			outFields: ["min_vert_deck"]
		});
		bridgeLayer.setSelectionSymbol(lineSelectionSymbol);
		bridgeLayer.on("error", onLayerError);
		map.addLayer(bridgeLayer);

		ucNoDataLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeService_demo/MapServer/4", {
			outFields: ["min_vert_deck"]
		});
		ucNoDataLayer.setSelectionSymbol(pointSelectionSymbol);
		ucNoDataLayer.on("error", onLayerError);
		map.addLayer(ucNoDataLayer);
	});

	document.forms.clearanceForm.onsubmit = function (e) {
		var clearanceText = e.target.clearance.value;
		var inches = Number(clearanceText);
		var feetAndInches;
		if (isNaN(inches)) {
			feetAndInches = new FeetAndInches(clearanceText);
			inches = feetAndInches.totalInches();
		}
		
		if (inches) {
			console.log(inches);
			[bridgeLayer, ucNoDataLayer].forEach(function (layer) {
				var query = new Query();
				query.where = "min_vert_deck < " + inches;
				layer.selectFeatures(query);
			});
		}

		return false;
	};

	/**
	 * Clear the selections from the layers.
	 */
	document.forms.clearanceForm.onreset = function () {
		[bridgeLayer, ucNoDataLayer].forEach(function (layer) {
			layer.clearSelection();
		});
	};
});