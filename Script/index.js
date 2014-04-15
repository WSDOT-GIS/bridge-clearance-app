/*global require*/
require([
	"esri/map",
	"esri/config",
	"esri/domUtils",
	"esri/layers/FeatureLayer",
	"esri/layers/ArcGISTiledMapServiceLayer",
	"esri/tasks/query",
	"esri/InfoTemplate"
], function (Map, esriConfig, domUtils, FeatureLayer, ArcGISTiledMapServiceLayer, Query, InfoTemplate) {
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

	function toHtmlTable(graphic) {
		var output = ["<table class='bridge-info on-under-code-", graphic.attributes.on_under_code === 1 ? "on" : "under", "'>"], name, value;
		for (name in graphic.attributes) {
			if (graphic.attributes.hasOwnProperty(name)) {
				value = graphic.attributes[name];
				output.push("<tr><th>", name.replace(/_/g, " "), "</th><td>", value, "</td></tr>");
			}
		}
		output.push("</table>");
		return output.join("");
	}

	var infoTemplate = new InfoTemplate("${bridge_name}", toHtmlTable);

	map.on("load", function () {
		bridgeOnLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeOnRecords/MapServer/0", {
			id: "bridge-on",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});
		bridgeUnderLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeUnderRecords/MapServer/0", {
			id: "bridge-under",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
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

	/**
	 * Creates a layer definition string
	 * @param {string} clearanceField - The name of the field that contains clearance data.
	 * @param {FeetAndInches} feetAndInches
	 * @param {string} [srid] - A state route ID in three-digit format.
	 * @param {Boolean} [exactMatch]
	 * @returns {Query}
	 */
	function createQuery(clearanceField, feetAndInches, srid, exactMatch) {
		var where = [clearanceField, " < ", feetAndInches.toWeirdoFormat()];
		if (srid) {
			if (exactMatch) {
				where.push(" AND SRID = '", srid, "'");
			} else {
				where.push(" AND SRID LIKE '", srid, "%'");
			}
		}
		var query = new Query();
		query.where = where.join("");
		return query;
	}

	document.forms.clearanceForm.onsubmit = function () {
		var clearanceText, inches, feetAndInches, routeText, exactRoute;
		try {
			this.blur();

			// Get the clearance amount.
			clearanceText = this.clearance.value;
			inches = Number(clearanceText);
			feetAndInches;
			if (isNaN(inches)) {
				feetAndInches = new FeetAndInches(clearanceText);
				inches = feetAndInches.totalInches();
			} else {
				feetAndInches = new FeetAndInches("0'" + inches + '"');
			}

			// Get the route filter
			routeText = this.route.value;
			exactRoute = this.routeFilterType.value === "exact";
			if (feetAndInches) {
				bridgeOnLayer.selectFeatures(createQuery("min_vert_deck", feetAndInches, routeText, exactRoute));
				bridgeUnderLayer.selectFeatures(createQuery("vert_clrnc_route_min", feetAndInches, routeText, exactRoute));
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
		bridgeOnLayer.clearSelection();
		bridgeUnderLayer.clearSelection();
	};
});