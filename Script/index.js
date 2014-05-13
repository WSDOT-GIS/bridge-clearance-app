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
	"esri/renderers/UniqueValueRenderer",
	"esri/symbols/SimpleMarkerSymbol"
], function (Map, esriConfig, domUtils, FeatureLayer, ArcGISTiledMapServiceLayer, Query, InfoTemplate, BasemapGallery,
	Basemap, BasemapLayer, Color, CartographicLineSymbol, webMercatorUtils, UniqueValueRenderer, SimpleMarkerSymbol) {
	var map, bridgeOnLayer, bridgeUnderLayer, onProgress, underProgress, vehicleHeight;

	var fieldsWithWeirdFormatNumbers = /^(?:(?:horiz_clrnc_route)|(?:horiz_clrnc_rvrs)|(?:vert_clrnc_route_max)|(?:vert_clrnc_route_min)|(?:vert_clrnc_rvrs_max)|(?:vert_clrnc_rvrs_min)|(?:min_vert_(?:(?:deck)|(?:under))))$/i;

	$('#tabs a').click(function (e) {
		e.preventDefault();
		$(this).tab('show');
	});

	$("[data-toggle=offcanvas]").click(function () {
		$(".row-offcanvas").toggleClass('active');
	});

	/** Set the height of the map div.
	*/
	function setMapDivHeight() {
		var topNavBar, mapDiv, desiredHeight;

		topNavBar = document.getElementById("topNavBar");
		mapDiv = document.getElementById("map");

		desiredHeight = window.innerHeight - topNavBar.clientHeight - 40;

		mapDiv.style.height = [desiredHeight, "px"].join("");

		//if (map) {
		// map.resize();
		//}
	}

	setMapDivHeight();

	window.addEventListener("resize", setMapDivHeight, true);
	window.addEventListener("deviceorientation", setMapDivHeight, true);

	/**
	 * Determines if a vehicle can pass under a structure in ANY lane.
	 * @param {Graphic} graphic
	 * @returns {number}
	 */
	function someLanesCanPass(graphic) {
		var output = 0;
		if (vehicleHeight <= graphic.attributes.vert_clrnc_route_max) {
			output = 1;
		}
		return output;
	}

	/**
	 * Converts the custom feet/inches format used by the bridge database into inches.
	 * @param {number} n
	 * @returns {number}
	 */
	function customToInches(n) {
		var feet, inches, output;
		if (typeof n === "number") {
			inches = n % 100;
			feet = (n - inches) / 100;
			output = feet * 12 + inches;
		} else {
			output = n;
		}
		return output;
	}

	/**
	 * Converts an amount in inches into the combined Feet/Inches format used by the bridge database.
	 * @param {number} inches - An integer representing an amount in inches.
	 * @returns {number}
	 */
	function inchesToCustom(inches) {
		var feetPart, inchesPart;
		inchesPart = inches % 12;
		feetPart = (inches - inchesPart) / 12;
		return feetPart * 100 + inchesPart;
	}

	/**
	 * Converts inches to a feet & inches label (X'XX").
	 * @param {number} inches
	 * @returns {string}
	 */
	function inchesToFeetAndInchesLabel(inches) {
		var inchesPart = inches % 12;
		var feetPart = (inches - inchesPart) / 12;
		return [feetPart, "'", inchesPart, '"'].join("");
	}

	onProgress = document.getElementById("onProgress");
	underProgress = document.getElementById("underProgress");

	domUtils.hide(onProgress);
	domUtils.hide(underProgress);

	var wsdotBasemapUrl = "http://www.wsdot.wa.gov/geosvcs/ArcGIS/rest/services/Shared/WebBaseMapWebMercator/MapServer";

	esriConfig.defaults.io.proxyUrl = "proxy/proxy.ashx";

	// Create the map, explicitly setting the LOD values. (This prevents the first layer added determining the LODs.)
	map = new Map("map", {
		basemap: "streets",
		center: [-120.80566406246835, 47.41322033015946],
		zoom: 7,
		showAttribution: true
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
		dl.setAttribute("class", "dl-horizontal");
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
	 * @param {RegExp} [feetInchesFields] - Matches the names of fields that contain feet + inches data in an integer format.
	 */
	function createTable(o, ignoredNames, feetInchesFields) {
		var table = document.createElement("table"), tr, th, td, value, tbody;
		table.setAttribute("class", "bridge-info table table-striped table-hover");
		table.createTHead();
		tbody = table.createTBody();
		for (var name in o) {
			if (o.hasOwnProperty(name) && (!ignoredNames || !ignoredNames.test(name))) {
				tr = document.createElement("tr");
				th = document.createElement("th");
				th.textContent = formatFieldName(name);
				tr.appendChild(th);

				td = document.createElement("td");
				value = o[name];
				// If this is a feet+inches field, format it appropriately.
				if (feetInchesFields && feetInchesFields.test(name) && value > 0) {
					value = inchesToFeetAndInchesLabel(customToInches(value) - 3);
				}
				td.textContent = value;
				tr.appendChild(td);
				tbody.appendChild(tr);
			}
		}
		return table;
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
		var ignoredFields;
		ignoredFields = /^(?:(?:((OBJECTID_?)|(Field))\d*)|(?:Shape_Length)|(?:\w+(?:(?:code)|(?:class)|(?:Error)|(?:_gid)|(?:indicator)))|(?:(?:(?:lrs)|(?:list))\w+)|(?:(?:min_)?(?:(?:vert)|(?:horiz))\w+)|(?:(?:(?:lateral)|(?:fed)|(?:sort))\w+)|(?:eventID)|(?:agency_id))$/i;

		var fragment = document.createDocumentFragment();

		var minClearance = customToInches(graphic.attributes.vert_clrnc_route_min);
		var maxClearance = customToInches(graphic.attributes.vert_clrnc_route_max);
		if (minClearance > 3) {
			minClearance -= 3;
		}
		if (maxClearance && maxClearance > 3) {
			maxClearance -= 3;
		}

		var dlObj = {};

		var linksHeader = document.createElement("h5");
		linksHeader.textContent = "Vertical Clearance";
		fragment.appendChild(linksHeader);

		if (minClearance) {
			dlObj.Minimum = inchesToFeetAndInchesLabel(minClearance);
		}
		if (maxClearance) {
			dlObj.Maximum = inchesToFeetAndInchesLabel(maxClearance);
		}

		var dl = toDL(dlObj);

		fragment.appendChild(dl);
		linksHeader = document.createElement("h5");
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

		var table = createTable(graphic.attributes, ignoredFields, fieldsWithWeirdFormatNumbers);

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
		var defaultPointSymbol, defaultLineSymbol, warningLineSymbol, pointRenderer, lineRenderer, defaultColor, warningColor;

		defaultColor = new Color([255, 85, 0, 255]);
		warningColor = new Color([255, 255, 0, 255]);

		defaultLineSymbol = new CartographicLineSymbol(CartographicLineSymbol.STYLE_SOLID,
			defaultColor, 10,
			CartographicLineSymbol.CAP_ROUND, CartographicLineSymbol.JOIN_MITER, 5);

		warningLineSymbol = new CartographicLineSymbol(CartographicLineSymbol.STYLE_SOLID,
			warningColor, 10,
			CartographicLineSymbol.CAP_ROUND, CartographicLineSymbol.JOIN_MITER, 5);

		defaultPointSymbol = new SimpleMarkerSymbol().setColor(defaultColor);

		var label = "Can pass in some lanes";
		var description = "Vehicle may be able to pass in some but not all lanes.";

		lineRenderer = new UniqueValueRenderer(defaultLineSymbol, someLanesCanPass);
		lineRenderer.addValue({
			value: 1,
			symbol: warningLineSymbol,
			label: label,
			description: description
		});

		pointRenderer = new UniqueValueRenderer(defaultPointSymbol, someLanesCanPass);
		pointRenderer.addValue({
			value: 1,
			symbol: new SimpleMarkerSymbol().setColor(warningColor),
			label: label,
			description: description
		});

		// Create the layer for the "on" features. Features will only appear on the map when they are selected.
		bridgeOnLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgesAndCrossings_20140417/MapServer/1", {
			id: "bridge-on",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});
		bridgeOnLayer.setRenderer(lineRenderer);
		// Attach events.
		bridgeOnLayer.on("selection-complete", handleSelectionComplete);
		bridgeOnLayer.on("selection-clear", handleSelectionClear);

		// Create the bridge under layer. Only selected features will appear on the map.
		bridgeUnderLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgesAndCrossings_20140417/MapServer/0", {
			id: "bridge-under",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			infoTemplate: infoTemplate
		});

		bridgeUnderLayer.setRenderer(pointRenderer);
		// Attach events.
		bridgeUnderLayer.on("selection-complete", handleSelectionComplete);
		bridgeUnderLayer.on("selection-clear", handleSelectionClear);
		// Add these layers to the map.
		map.addLayer(bridgeOnLayer);
		map.addLayer(bridgeUnderLayer);

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
			basemapIds: map.layerIds
		}, "basemapGallery");
		basemapGallery.startup();

		// Select the WSDOT basemap when the gallery dijit has loaded.
		// Hide the basemap gallery. (User will show it by clicking a button.)
		basemapGallery.on("load", function () {
			basemapGallery.select("wsdot");
		});

	});

	// Set up the progress bar to show when the map is loading.
	map.on("update-end", function () {
		domUtils.hide(document.getElementById("mapProgress"));
	});

	map.on("update-start", function () {
		domUtils.show(document.getElementById("mapProgress"));
	});

	/**
	 * Creates a layer definition string
	 * @param {string} clearanceField - The name of the field that contains clearance data.
	 * @param {number} inches
	 * @param {string} [srid] - A state route ID in three-digit format.
	 * @param {Boolean} [exactMatch]
	 * @returns {Query}
	 */
	function createQuery(clearanceField, inches, srid, exactMatch) {
		// Create the where clause for the clearance.
		var where = [clearanceField, " < ", inchesToCustom(inches + 3) ];
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
			if (isNaN(inches)) {
				feetAndInches = new FeetAndInches(clearanceText);
				inches = feetAndInches.totalInches();
			}

			// Get the route filter
			routeText = this.route.value;
			// Make sure that route text is valid
			if (routeText && !(/^\d+$/.test(routeText) || /^\d{3}(?:(\w{2})(\w{0,6}))?$/.test(routeText))) {
				alert("Invalid route");
				return false;
			}
			exactRoute = !document.getElementById("includeNonMainlineCheckbox").checked;
			if (inches) {
				vehicleHeight = inchesToCustom(inches + 3);
				bridgeOnLayer.selectFeatures(createQuery("vert_clrnc_route_min", inches, routeText, exactRoute));
				domUtils.show(onProgress);
				bridgeUnderLayer.selectFeatures(createQuery("vert_clrnc_route_min", inches, routeText, exactRoute));
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
		vehicleHeight = null;
	};
});