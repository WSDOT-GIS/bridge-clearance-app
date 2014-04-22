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
	"esri/geometry/webMercatorUtils",
	"esri/dijit/HomeButton"
], function (Map, esriConfig, domUtils, FeatureLayer, ArcGISTiledMapServiceLayer, Query, InfoTemplate, BasemapGallery, Basemap, BasemapLayer, Color, CartographicLineSymbol, webMercatorUtils, HomeButton) {
	var map, bridgeOnLayer, bridgeUnderLayer, onProgress, underProgress;

	onProgress = document.getElementById("onProgress");
	underProgress = document.getElementById("underProgress");

	domUtils.hide(onProgress);
	domUtils.hide(underProgress);

	var wsdotBasemapUrl = "http://www.wsdot.wa.gov/geosvcs/ArcGIS/rest/services/Shared/WebBaseMapWebMercator/MapServer";

	esriConfig.defaults.io.proxyUrl = "proxy/proxy.ashx";

	// Create the map, explicitly setting the LOD values. (This prevents the first layer added determining the LODs.)
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

	// Add the WSDOT basemap layer to the map.
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
	 * @param {string} [type="Index"]
	 * @returns {string}
	 */
	function createBeistUrl(graphic, type) {
		var url = null;
		if (graphic && graphic.attributes) {
			if (graphic.attributes.control_entity_gid) {
				if (!type) {
					type = "Index";
				}
				url = "http://beist.wsdot.loc/InventoryAndRepair/Inventory/BRIDGE/Details/" + type + "/" + graphic.attributes.control_entity_gid.replace(/[\{\}]/g, ""); // Replace removes leading and trailing curly braces.
			} else if (graphic.attributes.key_structure_id) {
				url = "http://beist.wsdot.loc/InventoryAndRepair/Inventory/BRIDGE?StructureID=" + graphic.attributes.key_structure_id;
			}
		}
		return url;
	}

	function createBeistListItem(graphic) {
		var mainLi = document.createElement("li");
		var mainA = document.createElement("a");
		mainA.target = "_blank";
		mainLi.appendChild(mainA);
		mainA.textContent = "BEIst";
		mainA.href = createBeistUrl(graphic);
		var ul, li, a;
		if (graphic.attributes.control_entity_gid) {
			ul = document.createElement("ul");
			li = document.createElement("li");
			ul.appendChild(li);
			a = document.createElement("a");
			a.target = "_blank";
			li.appendChild(a);
			a.href = createBeistUrl(graphic, "Correspondence");
			a.textContent = "Clearance Card";
			mainLi.appendChild(ul);
		}
		return mainLi;
	}

	/**
	 * Replaces the underscores in a string with spaces.
	 * @param {string} name
	 * @returns {string}
	 */
	function formatFieldName(name) {
		return name.replace(/_/g, " ");
	}

	/**
	 * Creates a definition list from an object's properties.
	 * @param {Object} o
	 * @returns {HTMLDListElement}
	 */
	function toDL(o) {
		var dl = document.createElement("dl"), dt, dd;
		for (var name in o) {
			if (o.hasOwnProperty(name)) {
				dt = document.createElement("dt");
				dd = document.createElement("dd");
				dt.textContent = formatFieldName(name);
				dd.textContent = o[name];
				dl.appendChild(dt);
				dl.appendChild(dd);
			}
		}
		return dl;
	}

	/**
	 * Creates an HTML table from an object's properties.
	 * @param {Object} o
	 * @param {RegExp} [ignoredNames] - Any properties with names that match this RegExp will be omitted from the table.
	 */
	function createTable(o, ignoredNames) {
		var table = document.createElement("table");
		table.setAttribute("class", "bridge-info");
		var tr, th, td;
		for (var name in o) {
			if (o.hasOwnProperty(name) && (!ignoredNames || !ignoredNames.test(name))) {
				tr = document.createElement("tr");
				th = document.createElement("th");
				th.textContent = formatFieldName(name);
				tr.appendChild(th);

				td = document.createElement("td");
				td.textContent = o[name];
				tr.appendChild(td);
				table.appendChild(tr);
			}
		}
		return table;
	}

	/**
	 * E.g., converts 1401 to 14"01'
	 * @param {(string|number)} v
	 * @returns {string}
	 */
	function addFeetAndInchesLabelsToBridgeValue(v) {
		if (typeof v === "number") {
			v = String(v);
		}
		var match = v.match(/^(\d+)(\d{2})$/);
		return [match[1], "'", match[2], '"'].join("");
	}

	/**
	 * Toggles the bridge details table's visibility.
	 */
	function toggleDetails() {
		var table = document.querySelector("table.bridge-info");
		if (table) {
			if (table.classList.contains("collapsed")) {
				table.classList.remove("collapsed");
				this.textContent = "Hide details";
			} else {
				table.classList.add("collapsed");
				this.textContent = "Details...";
			}
		}
		return false;
	}

	/**
	 * Creates an HTML table of a graphic's attributes.
	 * @param {esri/Graphic} graphic
	 * @returns {string}
	 */
	function toHtmlContent(graphic) {
		var graphicsLayer = graphic._graphicsLayer, ignoredFields;
		ignoredFields = /^(?:(?:\w+_gid)|(?:OBJECTID_?\d*)|(Field\d+)|(Shape_Length))$/i;

		var fragment = document.createDocumentFragment();

		var clearanceProperty = graphicsLayer === bridgeOnLayer ? "min_vert_deck" : graphicsLayer === bridgeUnderLayer ? "vert_clrnc_route_min" : null;
		var dl = toDL({
			"Vertical Clearance" : addFeetAndInchesLabelsToBridgeValue(graphic.attributes[clearanceProperty])
		});

		fragment.appendChild(dl);
		var linksHeader = document.createElement("h2");
		linksHeader.textContent = "Links";
		fragment.appendChild(linksHeader);

		var ul = document.createElement("ul");
		fragment.appendChild(ul);

		var li, a;

		// Add a google street view, SRView and BEIst urls if possible.
		var gsvUrl = getGoogleStreetViewUrl(graphic);
		if (gsvUrl) {
			li = document.createElement("li");
			a = document.createElement("a");
			a.href = gsvUrl;
			a.textContent = "Google Street View";
			a.target = "_blank";
			li.appendChild(a);
			ul.appendChild(li);
		}

		var srViewURL = createSRViewUrl(graphic);
		if (srViewURL) {
			li = document.createElement("li");
			a = document.createElement("a");
			a.href = srViewURL;
			a.target = "_blank";
			a.textContent = "Open location in SRView";
			li.appendChild(a);
			ul.appendChild(li);
		}
		////var beistURL = createBeistUrl(graphic);
		////if (beistURL) {
		////	li = document.createElement("li");
		////	a = document.createElement("a");
		////	a.href = beistURL;
		////	a.target = 'beist';
		////	a.textContent = "BEIst";
		////	li.appendChild(a);
		////	ul.appendChild(li);
		////}

		li = createBeistListItem(graphic);
		if (li) {
			ul.appendChild(li);
		}

		var table = createTable(graphic.attributes, ignoredFields);

		var p;
		if (table.classList) {
			table.classList.add("collapsed");
			p = document.createElement("p");
			a = document.createElement("a");
			a.href = "#";
			a.textContent = "Details...";
			a.onclick = toggleDetails;
			p.appendChild(a);
			fragment.appendChild(p);
		}

		fragment.appendChild(table);

		return fragment;
	}

	var infoTemplate = new InfoTemplate("${crossing_description}", toHtmlContent);

	/**
	 * @typedef {Object} FeatureSelectionCompleteResult
	 * @param {Graphic[]} features
	 * @param {Number} method
	 * @param {FeatureLayer} target
	 */

	/** Updates the feature count table.
	 * @param {FeatureSelectionCompleteResult} results
	 */
	function handleSelectionComplete(results) {
		// Determine which layer triggered the selection-complete event.
		// Get the corresponding table cell that holds its feature count.
		// Update the value in that table cell.
		var cellId = null;

		if (results.target.id === "bridge-on") {
			cellId = "oncount";
			domUtils.hide(onProgress);
		} else if (results.target.id === "bridge-under") {
			cellId = "undercount";
			domUtils.hide(underProgress);
		}
		
		if (cellId) {
			var cell = document.getElementById(cellId);
			if (cell) {
				cell.textContent = results.features.length;
			}
		}
	}

	/** Resets the feature count table cell corresponding to the layer that triggered the event to zero.
	 * @this {FeatureLayer}
	 */
	function handleSelectionClear() {
		if (this && this.id) {
			var divId = this.id === "bridge-on" ? "oncount" : this.id === "bridge-under" ? "undercount" : null;
			if (divId) {
				document.getElementById(divId).textContent = "0";
			}
		}
	}

	map.on("load", function () {
		// Create the cartographic line symbol that will be used to show the selected lines.
		// This gives them a better appearance than the default behavior.
		var lineSelectionSymbol = new CartographicLineSymbol(CartographicLineSymbol.STYLE_SOLID,
			new Color([255, 85, 0, 255]), 10,
			CartographicLineSymbol.CAP_ROUND, CartographicLineSymbol.JOIN_MITER, 5);

		// Create the layer for the "on" features. Features will only appear on the map when they are selected.
		bridgeOnLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgesAndCrossings_20140417/MapServer/1", {
			id: "bridge-on",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});
		// Attach events.
		bridgeOnLayer.on("selection-complete", handleSelectionComplete);
		bridgeOnLayer.on("selection-clear", handleSelectionClear);
		bridgeOnLayer.setSelectionSymbol(lineSelectionSymbol);

		// Create the bridge under layer. Only selected features will appear on the map.
		bridgeUnderLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgesAndCrossings_20140417/MapServer/0", {
			id: "bridge-under",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});
		// Attach events.
		bridgeUnderLayer.on("selection-complete", handleSelectionComplete);
		bridgeUnderLayer.on("selection-clear", handleSelectionClear);
		// Add these layers to the map.
		map.addLayer(bridgeOnLayer);
		map.addLayer(bridgeUnderLayer);

	});

	var homeButton = new HomeButton({ map: map }, document.getElementById("homeButton"));
	homeButton.startup();

	// Create the basemap gallery, adding the WSDOT map in addition to the default Esri basemaps.
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

	// Select the WSDOT basemap when the gallery dijit has loaded.
	// Hide the basemap gallery. (User will show it by clicking a button.)
	basemapGallery.on("load", function () {
		basemapGallery.select("wsdot");
		domUtils.hide(basemapGallery.domNode);
	});

	// Set up the progress bar to show when the map is loading.
	map.on("update-end", function () {
		domUtils.hide(document.getElementById("mapProgress"));
	});

	map.on("update-start", function () {
		domUtils.show(document.getElementById("mapProgress"));
	});

	// Set up the button that will show and hide the basemap gallery.
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
		// Create the where clause for the clearance.
		var where = [clearanceField, " < ", feetAndInches.toWeirdoFormat()];
		// If an SRID is specified, add to the where clause...
		if (srid) {
			// Pad the srid with zeroes if necessary.
			if (/^\d$/.test(srid)) {
				srid = "00" + srid;
			} else if (/^\d{2}$/.test(srid)) {
				srid = "0" + srid;
			}

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
				domUtils.show(onProgress);
				bridgeUnderLayer.selectFeatures(createQuery("vert_clrnc_route_min", feetAndInches, routeText, exactRoute));
				domUtils.show(underProgress);
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