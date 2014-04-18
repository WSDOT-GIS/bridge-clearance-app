/*global require*/
require([
	"esri/map",
	"esri/config",
	"esri/domUtils",
	"esri/layers/FeatureLayer",
	"esri/layers/ArcGISTiledMapServiceLayer",
	"esri/tasks/query",
	"esri/InfoTemplate",
	"esri/dijit/BasemapGallery",
	"esri/dijit/Basemap",
	"esri/dijit/BasemapLayer",
	"esri/Color",
	"esri/symbols/CartographicLineSymbol",
	"esri/geometry/webMercatorUtils"
], function (Map, esriConfig, domUtils, FeatureLayer, ArcGISTiledMapServiceLayer, Query, InfoTemplate, BasemapGallery, Basemap, BasemapLayer, Color, CartographicLineSymbol, webMercatorUtils) {
	var map, bridgeOnLayer, bridgeUnderLayer;

	var wsdotBasemapUrl = "http://www.wsdot.wa.gov/geosvcs/ArcGIS/rest/services/Shared/WebBaseMapWebMercator/MapServer";

	esriConfig.defaults.io.proxyUrl = "proxy/proxy.ashx";

	map = new Map("map", {
		showAttribution: true,
		spatialReference: {
			wkid: 3857,
		},
		lods: [
			  {
				"level": 0,
				"resolution": 156543.03392800014,
				"scale": 5.91657527591555E8
			  },
			  {
				"level": 1,
				"resolution": 78271.51696399994,
				"scale": 2.95828763795777E8
			  },
			  {
				"level": 2,
				"resolution": 39135.75848200009,
				"scale": 1.47914381897889E8
			  },
			  {
				"level": 3,
				"resolution": 19567.87924099992,
				"scale": 7.3957190948944E7
			  },
			  {
				"level": 4,
				"resolution": 9783.93962049996,
				"scale": 3.6978595474472E7
			  },
			  {
				"level": 5,
				"resolution": 4891.96981024998,
				"scale": 1.8489297737236E7
			  },
			  {
				"level": 6,
				"resolution": 2445.98490512499,
				"scale": 9244648.868618
			  },
			  {
				"level": 7,
				"resolution": 1222.992452562495,
				"scale": 4622324.434309
			  },
			  {
				"level": 8,
				"resolution": 611.4962262813797,
				"scale": 2311162.217155
			  },
			  {
				"level": 9,
				"resolution": 305.74811314055756,
				"scale": 1155581.108577
			  },
			  {
				"level": 10,
				"resolution": 152.87405657041106,
				"scale": 577790.554289
			  },
			  {
				"level": 11,
				"resolution": 76.43702828507324,
				"scale": 288895.277144
			  },
			  {
				"level": 12,
				"resolution": 38.21851414253662,
				"scale": 144447.638572
			  },
			  {
				"level": 13,
				"resolution": 19.10925707126831,
				"scale": 72223.819286
			  },
			  {
				"level": 14,
				"resolution": 9.554628535634155,
				"scale": 36111.909643
			  },
			  {
				"level": 15,
				"resolution": 4.77731426794937,
				"scale": 18055.954822
			  },
			  {
				"level": 16,
				"resolution": 2.388657133974685,
				"scale": 9027.977411
			  },
			  {
				"level": 17,
				"resolution": 1.1943285668550503,
				"scale": 4513.988705
			  },
			  {
				"level": 18,
				"resolution": 0.5971642835598172,
				"scale": 2256.994353
			  },
			  {
				"level": 19,
				"resolution": 0.29858214164761665,
				"scale": 1128.497176
			  }
		]
	});

	map.addLayer(new ArcGISTiledMapServiceLayer(wsdotBasemapUrl, { id: "wsdot" }));

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

	FeetAndInches.prototype.toString = function () {
		return [this.feet.toString(), "'", this.inches.toString(), '"'].join("");
	};

	/**
	 * Creates a Google Street View URL from a graphic's geometry.
	 * @param {esri/Graphic} graphic
	 * @returns {string}
	 */
	function getGoogleStreetViewUrl(graphic) {
		var geometry = graphic.geometry, xy, output = null;
		// Get the xy coordinates of the first (or only) point of the geometry.
		xy = geometry.type === "point" ? [geometry.x, geometry.y] : geometry.paths ? geometry.paths[0][0] : null;
		// Convert the coordinates from Web Mercator to WGS84.
		xy = webMercatorUtils.xyToLngLat(xy[0], xy[1]);
		// Create the output URL, inserting the xy coordinates.
		if (xy) {
			// http://maps.google.com/maps?q=&layer=c&cbll=47.15976,-122.48359&cbp=11,0,0,0,0
			output = ["http://maps.google.com/maps?q=&layer=c&cbll=", xy[1], ",", xy[0], "&cbp=11,0,0,0,0"].join("");
		}
		return output;
	}

	/**
	 * Creates a URL to open the ClickOnce SRView application from a graphic's geometry.
	 * @param {esri/Graphic} graphic
	 * @returns {string}
	 */
	function createSRViewUrl(graphic) {
		var baseUrl = "http://srview3i.wsdot.loc/stateroute/picturelog/v3/client/SRview.Windows.Viewer.application?";
		var re = /(\d{3})(?:(.{2})(.{0,6}))?/;
		var url;
		var match;
		if (graphic.attributes.SRID) {
			match = graphic.attributes.SRID.match(re);
			if (match) {
				url = [baseUrl, "srnum=", match[1], "&RRT=", match[2] || "", "&RRQ=", match[3] || ""].join("");
			}
		}
		var armField = graphic.attributes.hasOwnProperty("BeginARM") ? "BeginARM" : graphic.attributes.hasOwnProperty("PointARM") ? "PointARM" : null;
		if (armField) {
			url += "&arm=" + graphic.attributes[armField];
		}
		return url;
	}

	/**
	 * Creates a URL for Beist
	 * @param {esri/Graphic} graphic
	 * @returns {string}
	 */
	function createBeistUrl(graphic) {
		var url = null;
		if (graphic && graphic.attributes) {
			if (graphic.attributes.control_entity_gid) {
				url = "http://beist.wsdot.loc/InventoryAndRepair/Inventory/BRIDGE/Details/Index/" + graphic.attributes.control_entity_gid.replace(/[\{\}]/g, "");
			} else if (graphic.attributes.key_structure_id) {
				url = "http://beist.wsdot.loc/InventoryAndRepair/Inventory/BRIDGE?StructureID=" + graphic.attributes.key_structure_id;
			}
		}
		return url;
	}

	/**
	 * Creates an HTML table of a graphic's attributes.
	 * @param {esri/Graphic} graphic
	 * @returns {string}
	 */
	function toHtmlTable(graphic) {
		var graphicsLayer = graphic._graphicsLayer;
		var ignoredFields = /^(?:(?:control_entity_gid)|(?:OBJECTID_?\d*)|(Field\d+)|(Shape_Length))$/i;
		var output = [], name, value;

		var clearanceProperty = graphicsLayer === bridgeOnLayer ? "min_vert_deck" : graphicsLayer === bridgeUnderLayer ? "vert_clrnc_route_min" : null;
		if (clearanceProperty) {
			output.push("<dl><dt>", clearanceProperty, "</dt><dd>", graphic.attributes[clearanceProperty], "</dd></dl>");
		}

		output.push("<h2>Links</h2><ul>");
		// Add a google street view url if possible.
		var gsvUrl = getGoogleStreetViewUrl(graphic);
		if (gsvUrl) {
			output.push("<li><a href='", gsvUrl, "' target='google_street_view'>Google Street View</a></li>");
		}
		var srViewURL = createSRViewUrl(graphic);
		if (srViewURL) {
			output.push("<li><a href='", srViewURL, "' target='_blank'>Open location in SRView</a></li>");
		}
		var beistURL = createBeistUrl(graphic);
		if (beistURL) {
			output.push("<li><a href='", beistURL, "' target='beist'>BEIst</a></li>");
		}
		output.push("</ul>");
		output.push("<table class='bridge-info on-under-code-", graphic.attributes.on_under_code === 1 ? "on" : "under", "'>");
		for (name in graphic.attributes) {
			if (graphic.attributes.hasOwnProperty(name) && !ignoredFields.test(name)) {
				value = graphic.attributes[name];
				output.push("<tr><th>", name.replace(/_/g, " "), "</th><td>", value, "</td></tr>");
			}
		}
		output.push("</table>");

		return output.join("");
	}

	var infoTemplate = new InfoTemplate("${crossing_description}", toHtmlTable);

	map.on("load", function () {
		var lineSelectionSymbol = new CartographicLineSymbol(CartographicLineSymbol.STYLE_SOLID,
			new Color([255, 85, 0, 255]), 10,
			CartographicLineSymbol.CAP_ROUND, CartographicLineSymbol.JOIN_MITER, 5);

		bridgeOnLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgesAndCrossings_20140417/MapServer/1", {
			id: "bridge-on",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});
		bridgeOnLayer.setSelectionSymbol(lineSelectionSymbol);
		bridgeUnderLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgesAndCrossings_20140417/MapServer/0", {
			id: "bridge-under",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});
		map.addLayer(bridgeOnLayer);
		map.addLayer(bridgeUnderLayer);

	});

	var basemapGallery = new BasemapGallery({
		map: map,
		basemaps: [
			new Basemap({
				id: "wsdot",
				title: "WSDOT",
				thumbnailUrl: "Images/WsdotBasemapThumbnail.jpg",
				layers: [
					new BasemapLayer({
						url: wsdotBasemapUrl
					})
				]
			})
		],
		basemapIds: ["wsdot"]
	}, "basemapGallery");
	basemapGallery.startup();

	basemapGallery.on("load", function () {
		basemapGallery.select("wsdot");
		domUtils.hide(basemapGallery.domNode);
	});

	map.on("update-end", function () {
		domUtils.hide(document.getElementById("mapProgress"));
	});

	map.on("update-start", function () {
		domUtils.show(document.getElementById("mapProgress"));
	});

	document.getElementById("basemapsToggleButton").onclick = function () {
		domUtils.toggle(basemapGallery.domNode);
	};

	/**
	 * Creates a layer definition string
	 * @param {string} clearanceField - The name of the field that contains clearance data.
	 * @param {FeetAndInches} feetAndInches
	 * @param {string} [srid] - A state route ID in three-digit format.
	 * @param {Boolean} [exactMatch]
	 * @returns {Query}
	 */
	function createQuery(clearanceField, feetAndInches, srid, exactMatch) {
		// Pad the srid with zeroes if necessary.
		if (/^\d$/.test(srid)) {
			srid = "00" + srid;
		} else if (/^\d{2}$/) {
			srid = 0 + srid;
		}

		// Create the where clause for the clearance.
		var where = [clearanceField, " < ", feetAndInches.toWeirdoFormat()];
		// If an SRID is specified, add to the where clause...
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
			exactRoute = !document.getElementById("includeNonMainlineCheckbox").checked;
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