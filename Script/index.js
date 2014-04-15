/*global require*/
require([
	"esri/map",
	"esri/config",
	"esri/domUtils",
	"esri/layers/ArcGISDynamicMapServiceLayer",
	"esri/layers/ArcGISTiledMapServiceLayer"
], function (Map, esriConfig, domUtils, ArcGISDynamicMapServiceLayer, ArcGISTiledMapServiceLayer) {
	var map, bridgeOnLayer, bridgeUnderLayer;

	esriConfig.defaults.io.proxyUrl = "proxy/proxy.ashx";

	map = new Map("map", {
		showAttribution: true
	});

	map.addLayer(new ArcGISTiledMapServiceLayer("http://www.wsdot.wa.gov/geosvcs/ArcGIS/rest/services/Shared/WebBaseMapWebMercator/MapServer"));

	/**
	 * Parses a string into feet and inches.
	 * @param {string} str
	 * @property {number} feet
	 * @property {number} inches
	 */
	function FeetAndInches(str) {
		var feetAndInRe = /(\d+)'\s*(?:(\d+(?:\.\d+)?)")?/i;
		var match = str.match(feetAndInRe);
		if (!match) {
			throw new Error("Invalid format.");
		} 
		this.feet = Number(match[1]);
		this.inches = match[2] ? Number(match[2]) : 0;
	}

	/**
	 * Converts to the total number of inches.
	 * @returns {number}
	 */
	FeetAndInches.prototype.totalInches = function () {
		return this.feet * 12 + this.inches;
	};

	/**
	 * Converts to the total number of feet.
	 * @returns {number}
	 */
	FeetAndInches.prototype.totalFeet = function () {
		return this.feet + this.inches / 12;
	};

	/**
	 * Converts to the weird format used by the bridge data.
	 * @returns {number}
	 */
	FeetAndInches.prototype.toWeirdoFormat = function () {
		return this.feet * 100 + this.inches;
	};

	map.on("load", function () {
		bridgeOnLayer = new ArcGISDynamicMapServiceLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeOnRecords/MapServer", {
			id: "bridge-on",
			visible: false
		});
		bridgeUnderLayer = new ArcGISDynamicMapServiceLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeUnderRecords/MapServer", {
			id: "bridge-under",
			visible: false
		});
		map.addLayer(bridgeOnLayer);
		map.addLayer(bridgeUnderLayer);
	});

	map.on("update-end", function () {
		domUtils.hide(document.getElementById("mapProgress"));
	});

	map.on("update-start", function () {
		domUtils.show(document.getElementById("mapProgress"));
	});

	document.forms.clearanceForm.onsubmit = function () {
		var clearanceText, inches, feetAndInches, layerDefinitions;
		try {
			this.blur();
			clearanceText = this.clearance.value;
			inches = Number(clearanceText);
			feetAndInches;
			if (isNaN(inches)) {
				feetAndInches = new FeetAndInches(clearanceText);
				inches = feetAndInches.totalInches();
			} else {
				feetAndInches = new FeetAndInches("0'" + inches + '"');
			}
		
			if (feetAndInches) {
				layerDefinitions = ["min_vert_deck < " + feetAndInches.toWeirdoFormat()];
				bridgeOnLayer.setLayerDefinitions(layerDefinitions);
				layerDefinitions = ["vert_clrnc_route_min < " + feetAndInches.toWeirdoFormat()];
				bridgeUnderLayer.setLayerDefinitions(layerDefinitions);
				bridgeOnLayer.show();
				bridgeUnderLayer.show();
			}
		} catch (err) {
			console.error(err);
		}

		return false;
	};

	/**
	 * Clear the selections from the layers.
	 */
	document.forms.clearanceForm.onreset = function () {
		bridgeOnLayer.hide();
		bridgeUnderLayer.hide();
		bridgeOnLayer.setDefaultLayerDefinitions();
		bridgeUnderLayer.setDefaultLayerDefinitions();
	};
});