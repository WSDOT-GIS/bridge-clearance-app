/*eslint-env jquery*/
/*global Terraformer */
require([
	"mobile-detect",
	"esri/map",
	"esri/graphic",
	"esri/geometry/Extent",
	"esri/SpatialReference",
	"esri/config",
	"esri/domUtils",
	"esri/layers/FeatureLayer",
	"esri/tasks/query",
	"esri/InfoTemplate",
	"esri/dijit/BasemapGallery",
	"esri/Color",
	"esri/symbols/CartographicLineSymbol",
	"esri/geometry/webMercatorUtils",
	"esri/renderers/UniqueValueRenderer",
	"esri/symbols/SimpleMarkerSymbol",
	"esri/urlUtils",
	"esri/dijit/PopupMobile",
	"esri/layers/ArcGISDynamicMapServiceLayer",
	"esri/tasks/QueryTask",
	"esri/dijit/HomeButton",
	"esri/dijit/Geocoder",
	"dojo/promise/all",
	"elc",
	"dojo/domReady!"
], function (MobileDetect, Map, Graphic, Extent, SpatialReference, esriConfig, domUtils, FeatureLayer, Query, InfoTemplate, BasemapGallery,
	Color, CartographicLineSymbol, webMercatorUtils, UniqueValueRenderer, SimpleMarkerSymbol, urlUtils,
	PopupMobile, ArcGISDynamicMapServiceLayer, QueryTask, HomeButton, Geocoder, all, RouteLocator
) {
	"use strict";
	var map, bridgeOnLayer, bridgeUnderLayer, vehicleHeight, linesServiceUrl, pointsServiceUrl, routeLocator, isMobile;

	routeLocator = new RouteLocator();

	/**
	 * Keyboard event
	 * @external KeyboardEvent
	 * @see  https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
	 */

	/**
	 * Rejects keyboard input if it is non-numeric.
	 * Special characters (e.g., Delete, Tab) are also allowed.
	 * @param {KeyboardEvent} e
	 * @this {HTMLInputElement}
	 */
	function rejectNonNumericInput(e) {
		var unicodeRe = /U\+(\d+)/;
		// Chrome doesn't support the standard key property, so use keyIdentifier instead.
		// Instead of the actual character that "key" returns, keyIdentifier returns
		// A string such as "U+004F" representing the unicode character.

		if (e && (e.key || e.keyIdentifier)) {
			// For special characters (e.g., "Shift", a string containing the name of the key is returned.)
			var ch = e.key || e.keyIdentifier;
			var match = ch.match(unicodeRe);
			// keyIdentifier returns a unicode. Convert to string.
			if (match) {
				ch = String.fromCharCode(Number.parseInt(match[1], 16));
			}
			if (!/(?:^[0-9\t]$)|(?:(?:Backspace)|(?:Tab)|(?:Delete)|(?:Home)|(?:End)|(?:Enter))/i.test(ch)) {
				e.preventDefault();
			}
		}
	}

	/**
	 * Sets up event handlers on input elements to make them reject
	 * non-numeric input.
	 * @param {NodeList} inputs
	 */
	function restrictToNumericInput(inputs) {
		var input;
		if (inputs) {
			for (var i = 0, l = inputs.length; i < l; i += 1) {
				input = inputs[i];
				input.onkeypress = rejectNonNumericInput;
			}
		}
	}

	// Prevent user from entering non-numeric characters in number boxes.
	restrictToNumericInput(document.querySelectorAll("input[type=number],#routeFilterBox"));

	/**
	 * Gets the extent of all graphics' geometries.
	 * @param {Graphic[]} graphics
	 * @returns {Extent}
	 */
	function getExtentOfGraphics(graphics) {
		// Convert the graphics' geometries from ArcGIS to Terraformer Primitive.
		// Output will be an array of Terraformer geometry objects.
		var geoJsons = graphics.map(function (g) {
			return Terraformer.ArcGIS.parse(g.geometry);
		});
		// Create a GeoJSON GeometryCollection, then calculate the bounds.
		// Use the result to create an ArcGIS Extent.
		var geometryCollection = new Terraformer.GeometryCollection(geoJsons);
		var env = Terraformer.Tools.calculateBounds(geometryCollection);
		env = new Extent(env[0], env[1], env[2], env[3]);
		return env;
	}

	// Setup zoom to results link.
	(function (link) {
		link.onclick = function () {
			var extent = getExtentOfGraphics(bridgeOnLayer.graphics.concat(bridgeUnderLayer.graphics));
			map.setExtent(extent, true);
			return false;
		};
	}(document.getElementById("zoomToResultsLink")));

	function hideResults() {
		document.getElementById("results").classList.add("hidden");
	}

	function showResults() {
		document.getElementById("results").classList.remove("hidden");
	}

	/**
	 * Makes it so that anchor elements marked with "disabled" class don't funciton.
	 */
	function disableLinkBasedOnClass() {

		function doNothing() {
			return false;
		}

		var disabledLinks = document.querySelectorAll(".disabled > a");

		var link;
		for (var i = 0; i < disabledLinks.length; i++) {
			link = disabledLinks[0];
			link.onclick = doNothing;
		}
	}

	disableLinkBasedOnClass();

	linesServiceUrl = "http://data.wsdot.wa.gov/arcgis/rest/services/Bridge/BridgeVerticalClearances/MapServer/1";
	pointsServiceUrl = "http://data.wsdot.wa.gov/arcgis/rest/services/Bridge/BridgeVerticalClearances/MapServer/0";

	var fieldsWithWeirdFormatNumbers = /^(?:(?:horiz_clrnc_route)|(?:horiz_clrnc_rvrs)|(?:vert_clrnc_route_max)|(?:vert_clrnc_route_min)|(?:vert_clrnc_rvrs_max)|(?:vert_clrnc_rvrs_min)|(?:min_vert_(?:(?:deck)|(?:under))))$/i;

	function populateFieldsWithQueryStringValues() {
		// Read query string parameters
		// clearance
		// route
		// include-non-mainline

		var form = document.forms.clearanceForm;
		var urlObj = urlUtils.urlToObject(location.toString());
		var query = urlObj.query;

		if (query) {
			if (query.feet) {
				form.feet.value = query.feet;
			}
			if (query.inches) {
				form.inches.value = query.inches;
			}
			if (query.route) {
				form.route.value = query.route;
			}
			if (query.hasOwnProperty("include-non-mainline")) {
				form["include-non-mainline"].checked = /^(?:(?:true)|1|(?:yes))$/i.test(query["include-non-mainline"]);
			}
			form.onsubmit();
		}

	}

	// Setup tab click events.
	$('#tabs a').click(function (e) {
		e.preventDefault();
		$(this).tab('show');
	});

	// Setup the offcanvas button functionality.
	$("[data-toggle=offcanvas]").click(function () {
		var span;
		$(".row-offcanvas").toggleClass('active');
		// Change icon on button.
		span = this.querySelector("span");
		$(span).toggleClass("glyphicon-list").toggleClass("glyphicon-globe");
	});

	/** Set the height of the map div.
	*/
	function setDivHeights() {
		var topNavBar, mapDiv, desiredHeight, sidebarDiv;

		topNavBar = document.getElementById("topNavBar");
		mapDiv = document.getElementById("map");
		sidebarDiv = document.getElementById("sidebar");

		desiredHeight = window.innerHeight - topNavBar.clientHeight - 40;
		desiredHeight = [desiredHeight, "px"].join("");

		mapDiv.style.height = desiredHeight;
		sidebarDiv.style.height = desiredHeight;

		var tabPanes = document.querySelectorAll(".tab-pane");

		desiredHeight = window.innerHeight - topNavBar.clientHeight - 80;
		desiredHeight = [desiredHeight, "px"].join("");

		for (var i = 0, l = tabPanes.length; i < l; i += 1) {
			tabPanes[i].style.height = desiredHeight;
		}
	}

	setDivHeights();

	window.addEventListener("resize", setDivHeights, true);
	window.addEventListener("deviceorientation", setDivHeights, true);

	/**
	 * Determines if a vehicle can pass under a structure in ANY lane.
	 * @param {Graphic} graphic
	 * @returns {number}
	 */
	function someLanesCanPass(graphic) {
		var output = 0;
		if (vehicleHeight <= graphic.attributes.VCMAX) {
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

	esriConfig.defaults.io.proxyUrl = "proxy/proxy.ashx";

	["data.wsdot.wa.gov"].forEach(function (serverName) {
		esriConfig.defaults.io.corsEnabledServers.push(serverName);
	});

	var mapInitExtent = new Extent({ "xmin": -14058520.2360666, "ymin": 5539437.0343901999, "ymax": 6499798.1008670302, "xmax": -12822768.6769759, "spatialReference": { "wkid": 3857 } });

	// Create the map, explicitly setting the LOD values. (This prevents the first layer added determining the LODs.)
	var mapCreationParams = {
		extent: mapInitExtent,
		lods: [
			{ "level": 0, "resolution": 156543.033928, "scale": 591657527.591555 },
			{ "level": 1, "resolution": 78271.5169639999, "scale": 295828763.795777 },
			{ "level": 2, "resolution": 39135.7584820001, "scale": 147914381.897889 },
			{ "level": 3, "resolution": 19567.8792409999, "scale": 73957190.948944 },
			{ "level": 4, "resolution": 9783.93962049996, "scale": 36978595.474472 },
			{ "level": 5, "resolution": 4891.96981024998, "scale": 18489297.737236 },
			{ "level": 6, "resolution": 2445.98490512499, "scale": 9244648.868618 },
				// Start
			{ "level": 7, "resolution": 1222.99245256249, "scale": 4622324.434309 },
			{ "level": 8, "resolution": 611.49622628138, "scale": 2311162.217155 },
			{ "level": 9, "resolution": 305.748113140558, "scale": 1155581.108577 },
			{ "level": 10, "resolution": 152.874056570411, "scale": 577790.554289 },
			{ "level": 11, "resolution": 76.4370282850732, "scale": 288895.277144 },
			{ "level": 12, "resolution": 38.2185141425366, "scale": 144447.638572 },
			{ "level": 13, "resolution": 19.1092570712683, "scale": 72223.819286 },
			{ "level": 14, "resolution": 9.55462853563415, "scale": 36111.909643 },
			{ "level": 15, "resolution": 4.77731426794937, "scale": 18055.954822 },
			{ "level": 16, "resolution": 2.38865713397468, "scale": 9027.977411 },
			{ "level": 17, "resolution": 1.19432856685505, "scale": 4513.988705 },
			{ "level": 18, "resolution": 0.597164283559817, "scale": 2256.994353 },
			{ "level": 19, "resolution": 0.298582141647617, "scale": 1128.497176 }
		],
		minZoom: 7,
		maxZoom: 19,
		showAttribution: true
	};

	isMobile = Boolean((new MobileDetect(window.navigator.userAgent)).mobile());

	// Use the mobile popup on smaller screens.
	if (document.body.clientWidth < 768) {
		mapCreationParams.infoWindow = new PopupMobile(null, document.createElement("div"));
	}

	map = new Map("map", mapCreationParams);

	/**
	 * Parses a string into feet and inches.
	 * @param {number} feet
	 * @param {number} inches
	 * @property {number} feet
	 * @property {number} inches
	 */
	function FeetAndInches(feet, inches) {
		this.feet = feet ? Number(feet) : 0;
		this.inches = inches ? Number(inches) : 0;
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
	 * Creates an HTML table listing an object's properties.
	 * @param {Object} o
	 * @returns {HTMLTableElement}
	 */
	function objectToTable(o) {
		var table, row, cell, value;
		var aliases = {
			"SRMP": "Milepost"
		};
		table = document.createElement("table");
		table.classList.add("table");
		for (var propName in o) {
			if (o.hasOwnProperty(propName)) {
				row = table.insertRow(-1);
				cell = document.createElement("th");
				cell.textContent = aliases.hasOwnProperty(propName) ? aliases[propName] : propName;
				value = o[propName];
				row.appendChild(cell);
				cell = row.insertCell(-1);
				if (typeof value === "object") {
					cell.appendChild(objectToTable(value));
				} else {
					cell.textContent = o[propName];
				}
			}
		}
		return table;
	}

	/**
	 * Creates a dictionary of field aliases for a layer.
	 * @param {Layer} layer
	 * @returns {Object.<string, string>}
	 */
	function createFieldAliasDictionary(layer) {
		var output, field, i, l;
		if (layer && layer.fields) {
			output = {};
			for (i = 0, l = layer.fields.length; i < l; i += 1) {
				field = layer.fields[i];
				output[field.name] = field.alias || field.name;
			}
		}
		return output;
	}

	/**
	 * Creates an HTML table from an object's properties.
	 * @param {Graphic} graphic
	 * @param {RegExp} [fieldsToInclude] - Only the fields with names contained in this list will be included in the output table.
	 * @param {RegExp} [feetInchesFields] - Matches the names of fields that contain feet + inches data in an integer format.
	 * @returns {HTMLTableElement}
	 */
	function createTable(graphic, fieldsToInclude, feetInchesFields) {
		var table = document.createElement("table"), tr, th, td, value, tbody, o, aliasDict;
		o = graphic.attributes;
		aliasDict = createFieldAliasDictionary(graphic.getLayer());
		table.setAttribute("class", "bridge-info table table-striped table-hover");
		table.createTHead();
		tbody = table.createTBody();

		if (fieldsToInclude) {
			fieldsToInclude.forEach(function (name) {
				if (o.hasOwnProperty(name)) {
					tr = document.createElement("tr");
					th = document.createElement("th");
					th.textContent = aliasDict[name]; //formatFieldName(name);
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
			});
		}
		return table;
	}

	/**
	 * Toggles the bridge details table's visibility.
	 * @returns {boolean} Returns false so that link is not actually followed when clicked.
	 */
	function toggleDetails(e) {
		var table, a = e.target, textNode, icon;
		table = document.querySelector("table.bridge-info");
		icon = document.createElement("span");
		a.innerHTML = "";
		if (table) {
			if (table.classList.contains("collapsed")) {
				table.classList.remove("collapsed");
				textNode = document.createTextNode("Hide Details ");
				icon.setAttribute("class", "glyphicon glyphicon-chevron-up");
			} else {
				table.classList.add("collapsed");
				textNode = document.createTextNode("Details... ");
				icon.setAttribute("class", "glyphicon glyphicon-chevron-down");
			}
			a.appendChild(textNode);
			a.appendChild(icon);
		}
		return false;
	}

	/**
	 * Gets a text string showing the SRMP range from a graphic's attributes.
	 * @param {Graphic} graphic
	 * @returns {string}
	 */
	function getSrmpRangeText(graphic) {
		var output = [];
		if (graphic && graphic.attributes) {
			if (graphic.attributes.hasOwnProperty("lrs_traffic_flow_beg")) {
				output.push(graphic.attributes.lrs_traffic_flow_beg);
			}
			// If there's an end SRMP value that is non-zero...
			if (graphic.attributes.lrs_traffic_flow_end) {
				output.push(graphic.attributes.lrs_traffic_flow_end);
			}
		}
		return output.join(" — ");
	}

	/**
	 * Creates an HTML table of a graphic's attributes.
	 * @param {esri/Graphic} graphic
	 * @returns {string}
	 */
	function toHtmlContent(graphic) {
		var fieldsToInclude;

		fieldsToInclude = [
			"structure_id",
			"bridge_no",
			"crossing_description",
			"facilities_carried",
			"feature_intersected",
			"structure_length"
		];

		var fragment = document.createDocumentFragment();

		var minClearance = customToInches(graphic.attributes.VCMIN);
		var maxClearance = customToInches(graphic.attributes.VCMAX);
		if (minClearance > 3) {
			minClearance -= 3;
		}
		if (maxClearance && maxClearance > 3) {
			maxClearance -= 3;
		}

		var dlObj = {};

		dlObj["Vertical Clearance"] = {
			"Minimum": inchesToFeetAndInchesLabel(minClearance),
			"Maximum": inchesToFeetAndInchesLabel(maxClearance)
		};
		dlObj.SRMP = getSrmpRangeText(graphic);
		var dl = objectToTable(dlObj);
		fragment.appendChild(dl);


		var ul = document.createElement("ul");
		ul.setAttribute("class", "link-list");
		fragment.appendChild(ul);

		var li, a;

		// Add a google street view link if possible.
		var gsvUrl = getGoogleStreetViewUrl(graphic);
		if (gsvUrl) {
			li = document.createElement("li");
			li.setAttribute("class", "google-street-view");
			a = document.createElement("a");
			a.setAttribute("class", "google-street-view");
			a.href = gsvUrl;
			a.textContent = "Google Street View";
			////a.innerHTML += " <span class='glyphicon glyphicon-new-window'></span>";
			a.target = "_blank";
			li.appendChild(a);
			ul.appendChild(li);
		}

		// Add link
		// <a href="http://www.wsdot.wa.gov/CommercialVehicle/county_permits.htm" target="_blank">Local agency contacts</a>
		li = document.createElement("li");
		a = document.createElement("a");
		a.href = "http://www.wsdot.wa.gov/CommercialVehicle/county_permits.htm";
		a.target = "_blank";
		a.textContent = "Local agency contacts";
		li.appendChild(a);
		ul.appendChild(li);

		var table = createTable(graphic, fieldsToInclude, fieldsWithWeirdFormatNumbers);

		var p;
		if (table.classList) {
			table.classList.add("collapsed");
			p = document.createElement("p");
			a = document.createElement("a");
			a.href = "#";
			a.innerHTML = "Details...<span class='glyphicon glyphicon-chevron-down'></span>";
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

	function calulateTotal(element) {
		var onCount = Number(element.getAttribute("data-on-count"));
		var underCount = Number(element.getAttribute("data-under-count"));
		element.textContent = onCount + underCount;
	}

	/** Updates the feature count table.
	 * @param {FeatureSelectionCompleteResult} results
	 */
	function handleSelectionComplete(results) {
		// Determine which layer triggered the selection-complete event.
		// Get the corresponding table cell that holds its feature count.
		// Update the value in that table cell.
		var noPassCell, somePassCell, somePassCount, noPassCount, totalCount;

		noPassCell = document.getElementById("noPassCount");
		somePassCell = document.getElementById("somePassCount");

		totalCount = results.features.length;
		somePassCount = results.features.filter(function (graphic) {
			return !!someLanesCanPass(graphic);
		}).length;
		noPassCount = totalCount - somePassCount;

		var propertyName = results.target.id === "bridge-on" ? "data-on-count" : "data-under-count";
		noPassCell.setAttribute(propertyName, noPassCount);
		somePassCell.setAttribute(propertyName, somePassCount);
		calulateTotal(noPassCell);
		calulateTotal(somePassCell);
	}

	/** Resets the feature count table cell corresponding to the layer that triggered the event to zero.
	 * @this {FeatureLayer}
	 */
	function handleSelectionClear() {
		/*jshint validthis:true*/
		var noPassCell, somePassCell;

		noPassCell = document.getElementById("noPassCount");
		somePassCell = document.getElementById("somePassCount");

		var propertyName = this.id === "bridge-on" ? "data-on-count" : "data-under-count";
		noPassCell.setAttribute(propertyName, 0);
		somePassCell.setAttribute(propertyName, 0);
		calulateTotal(noPassCell);
		calulateTotal(somePassCell);
		/*jshint validthis:false*/
	}

	/**
	 *
	 * @param {Object} evt
	 * @param {Error} evt.error
	 * @param {Object} evt.target
	 */
	function handleLayerError(evt) {
		console.error("layer error", evt); // eslint-disable-line no-console
		document.head.innerHTML = "";
		document.body.innerHTML = "<p>A problem was encountered contacting the bridge services. Please try again later.</p>";
	}

	// Create the home button.
	new HomeButton({
		map: map
	}, "homeButton").startup();

	// Create Geocoder
	new Geocoder({
		map: map,
		autoComplete: true,
		highlightLocation: false,
		arcgisGeocoder: {
			sourceCountry: "US",
			searchExtent: mapInitExtent,
			placeholder: "Find an address"
		}
	}, "geocoder");

	map.on("load", function () {
		// Create the cartographic line symbol that will be used to show the selected lines.
		// This gives them a better appearance than the default behavior.
		var milepostLayer, defaultPointSymbol, defaultLineSymbol, warningLineSymbol, pointRenderer, lineRenderer, defaultColor, warningColor;

		/**
		 * Shows a div over the map at the point where the mouse cursor is.
		 * @param {MouseEvent} e
		 * @param {Graphic} e.graphic
		 */
		function showHoverText(e) {
			var div;
			div = document.getElementById("hovertext");
			if (!div) {
				div = document.createElement("div");
				div.id = "hovertext";
				document.body.appendChild(div);
			}
			div.textContent = e.graphic.attributes.crossing_description;
			div.setAttribute("style", ["position: fixed; left: ", e.clientX, "px; top: ", e.clientY, "px; display: block"].join(""));
		}

		/**
		 * Hides the hover tooltip text element.
		 */
		function hideHoverText() {
			var div = document.getElementById("hovertext");
			if (div) {
				div.setAttribute("style", "display: none");
			}
		}

		milepostLayer = new ArcGISDynamicMapServiceLayer("http://data.wsdot.wa.gov/arcgis/rest/services/Shared/MilepostValues/MapServer", {
			id: "mileposts"
		});
		map.addLayer(milepostLayer);

		defaultColor = new Color([255, 0, 0, 255]);
		warningColor = new Color([255, 255, 0, 255]);

		var pointSize = isMobile ? 20 : 10; // Use larger symbols for mobile.

		defaultLineSymbol = new CartographicLineSymbol(CartographicLineSymbol.STYLE_SOLID,
			defaultColor, pointSize,
			CartographicLineSymbol.CAP_ROUND, CartographicLineSymbol.JOIN_MITER, 5);

		warningLineSymbol = new CartographicLineSymbol(CartographicLineSymbol.STYLE_SOLID,
			warningColor, pointSize,
			CartographicLineSymbol.CAP_ROUND, CartographicLineSymbol.JOIN_MITER, 5);

		defaultPointSymbol = new SimpleMarkerSymbol().setColor(defaultColor).setSize(pointSize).setOutline(null);

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
			symbol: new SimpleMarkerSymbol().setColor(warningColor).setSize(pointSize).setOutline(null),
			label: label,
			description: description
		});

		// Create the layer for the "on" features. Features will only appear on the map when they are selected.
		bridgeOnLayer = new FeatureLayer(linesServiceUrl, {
			id: "bridge-on",
			mode: FeatureLayer.MODE_SELECTION,
			outFields: ["*"],
			orderByFields: ['VCMIN DESC'],
			infoTemplate: infoTemplate
		});
		bridgeOnLayer.setRenderer(lineRenderer);
		// Attach events.
		bridgeOnLayer.on("selection-complete", handleSelectionComplete);
		bridgeOnLayer.on("selection-clear", handleSelectionClear);

		// Create the bridge under layer. Only selected features will appear on the map.
		bridgeUnderLayer = new FeatureLayer(pointsServiceUrl, {
			id: "bridge-under",
			mode: FeatureLayer.MODE_SELECTION,
			orderByFields: ['VCMIN DESC'],
			outFields: ["*"],
			infoTemplate: infoTemplate
		});

		bridgeUnderLayer.setRenderer(pointRenderer);
		// Attach events.
		bridgeUnderLayer.on("selection-complete", handleSelectionComplete);
		bridgeUnderLayer.on("selection-clear", handleSelectionClear);

		bridgeOnLayer.on("error", handleLayerError);
		bridgeUnderLayer.on("error", handleLayerError);

		if (!isMobile) {
			bridgeOnLayer.on("mouse-over", showHoverText);
			bridgeOnLayer.on("mouse-out", hideHoverText);
			bridgeUnderLayer.on("mouse-over", showHoverText);
			bridgeUnderLayer.on("mouse-out", hideHoverText);
		}

		// Add these layers to the map.
		map.addLayer(bridgeOnLayer);
		map.addLayer(bridgeUnderLayer);

		populateFieldsWithQueryStringValues();

		////makePopupDraggable();

	});

	// Create the basemap gallery, adding the WSDOT map in addition to the default Esri basemaps.
	var basemapGallery = new BasemapGallery({ map: map, basemapsGroup: { id: "a89e08f2cc584e55a23b76fa7c9b8618" } }, "basemapGallery");
	basemapGallery.startup();

	// When the basemap gallery loads, select the first basemap with
	// the title "WSDOT Base Map". (There should be only one, but that's what
	// the code is doing.)
	basemapGallery.on("load", function () {
		var basemap, basemaps;
		basemaps = basemapGallery.basemaps.filter(function (basemap) {
			return basemap.title === "WSDOT Base Map";
		});
		if (basemaps && basemaps.length > 0) {
			basemap = basemaps[0];
			basemapGallery.select(basemap.id);
		}
	});

	// Set up the progress bar to show when the map is loading.
	map.on("update-end", function () {
		domUtils.hide(document.getElementById("mapProgress"));
	});

	map.on("update-start", function () {
		domUtils.show(document.getElementById("mapProgress"));
	});

	/**
	 * Determines if the input box contains one of the suggestions from its datalist.
	 * @param {HTMLInputElement} textbox
	 * @returns {boolean}
	 */
	function inputBoxContainsItemFromList(textbox) {
		var datalist, options, output = false;
		////datalist = document.getElementById(textbox.getAttribute("list"));
		datalist = document.getElementsByTagName("datalist")[0];
		options = datalist.querySelectorAll("option");

		for (var i = 0, l = options.length; i < l; i += 1) {
			if (options[i].value === textbox.value) {
				output = true;
				break;
			}
		}

		return output;
	}

	/**
	 * Pads a numeric string with less than three characters with zeroes
	 * so that it has three characters.
	 * @param {string} route
	 * @returns {string}
	 */
	function padRouteWithZeroes(route) {
		var output;
		if (route && /^\d+$/.test(route)) {
			if (route.length === 1) {
				output = "00" + route;
			} else if (route.length === 2) {
				output = "0" + route;
			}
		}
		return output || route;
	}

	/**
	 * Checks to make sure all input fields in the form have valid values
	 * and that all required values are provided.
	 * @returns {boolean} Returns true if all values are valid, false otherwise.
	 */
	function validateClearanceForm() {
		var form, feetAndInches, isValid, tooHighDiv;
		form = document.forms.clearanceForm;

		if (!form.feet.value && !form.inches.value) {
			document.getElementById("heightRequiredWarning").classList.remove("hidden");
			isValid = false;
		} else {
			document.getElementById("heightRequiredWarning").classList.add("hidden");
			feetAndInches = new FeetAndInches(form.feet.value, form.inches.value);
			tooHighDiv = document.getElementById("tooHighWarning");
			if (feetAndInches.totalInches() > 192) {
				tooHighDiv.classList.remove("hidden");
				isValid = false;
			} else {
				tooHighDiv.classList.add("hidden");
			}
		}

		if (form.route.value) {
			if (!inputBoxContainsItemFromList(form.route)) {
				document.getElementById("invalidRouteAlert").classList.remove("hidden");
				isValid = false;
			} else {
				document.getElementById("invalidRouteAlert").classList.add("hidden");
			}
		}

		if (isValid !== false) {
			isValid = true;
		}

		return isValid;
	}

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
		var where = [clearanceField, " < ", inchesToCustom(inches + 3)];
		var sridField = "lrs_route";
		// If an SRID is specified, add to the where clause...
		if (srid) {
			// Pad the srid with zeroes if necessary.
			srid = padRouteWithZeroes(srid);

			if (exactMatch) {
				where.push(" AND ", sridField, "= '", srid, "'");
			} else {
				where.push(" AND ", sridField, " LIKE '", srid, "%'");
			}
		} else if (exactMatch) {
			where.push(" AND CHAR_LENGTH(" + sridField + ") = 3");
		}
		var query = new Query();
		query.where = where.join("");
		return query;
	}

	/** Selects the features that match the parameters specified in the form.
	 * @param {HTMLFormElement} form
	 * @returns {Object} Returns the history state object.
	 */
	function selectFeatures(form) {
		var inches, feetAndInches, routeText, exactRoute, state, formIsValid, onSelectDeferred, underSelectDeferred;

		/**
		 * Shows an alert if no features were selected.
		 * @param {Array.<Array.<(boolean|esri/Graphic)>>} dListResponse - Response from a dojo/DeferredList.
		 */
		function showAlert(dListResponse) {
			var count = 0; // This will be used to count the number of selected features.
			var msg;
			// Count the selected features.
			dListResponse.forEach(function (response) {
				if (response.length >= 1) {
					count += response.length;
				}
			});
			if (count === 0) {
				// {feet: "5", inches: "", route: "", include-non-mainline: false}
				msg = ["No bridges found lower than ", state.feet, "′"];
				if (state.inches) {
					msg.push(state.inches, '″');
				}
				if (state.route) {
					msg.push(" on route ", state.route);
				}
				alert(msg.join(""));
			}
			//document.getElementById("results").classList.remove("hidden");
			showResults();
		}

		formIsValid = validateClearanceForm();

		if (!formIsValid) {
			return;
		}



		// Set the state that will be passed back if successful.
		state = {
			feet: form.feet.value,
			inches: form.inches.value,
			route: form.route.value,
			"include-non-mainline": document.getElementById("includeNonMainlineCheckbox").checked
		};
		try {
			form.blur();

			// Get the clearance amount.
			feetAndInches = new FeetAndInches(form.feet.value, form.inches.value);
			inches = feetAndInches.totalInches();

			// Get the route filter
			routeText = form.route.value;
			// Make sure that route text is valid
			if (routeText && !(/^\d+$/.test(routeText) || /^\d{3}(?:(\w{2})(\w{0,6}))?$/.test(routeText))) {
				alert("Invalid route");
				state = null;
			} else {
				exactRoute = !document.getElementById("includeNonMainlineCheckbox").checked;
				if (inches) {
					vehicleHeight = inchesToCustom(inches + 3);
					onSelectDeferred = bridgeOnLayer.selectFeatures(createQuery("VCMIN", inches, routeText, exactRoute));
					underSelectDeferred = bridgeUnderLayer.selectFeatures(createQuery("VCMIN", inches, routeText, exactRoute));
					all([onSelectDeferred, underSelectDeferred]).then(showAlert);
				}
			}
		} catch (err) {
			console.error(err); // eslint-disable-line no-console
			state = null;
		}
		return state;
	}

	/** Converts an object in to a query string.
	 * @param {Object.<string, string>} stateObj
	 * @returns {string}
	 */
	function stateToSearch(stateObj) {
		var output = [];
		for (var propName in stateObj) {
			if (stateObj.hasOwnProperty(propName)) {
				output.push([propName, encodeURIComponent(stateObj[propName])].join("="));
			}
		}
		return "?" + output.join("&");
	}



	document.forms.clearanceForm.onsubmit = function () {
		var state = selectFeatures(this);

		if (state) {
			// Update the URL so it can be bookmarked with the current search.
			if (history) {
				history.replaceState(state, document.title, stateToSearch(state));
			}
		}

		// Return false so that the form is not actually submitted.
		return false;
	};

	/**
	 * Clear the selections from the layers.
	 */
	document.forms.clearanceForm.onreset = function () {
		// document.getElementById("results").classList.add("hidden");
		hideResults();
		bridgeOnLayer.clearSelection();
		bridgeUnderLayer.clearSelection();
		vehicleHeight = null;

		var state = {
			feet: null,
			inches: null,
			route: null,
			"include-non-mainline": null
		};

		// Update the URL so it can be bookmarked with the current search.
		if (history) {
			history.replaceState(state, document.title, location.pathname);
		}

		document.getElementById("heightRequiredWarning").classList.add("hidden");
		document.getElementById("tooHighWarning").classList.add("hidden");
		document.getElementById("invalidRouteAlert").classList.add("hidden");

		map.setExtent(mapInitExtent);
	};

	$('#warningModal').modal();

	/**
	 * Hides the map's info window.
	 */
	function hideInfoWindow() {
		map.infoWindow.hide();
	}

	document.forms.clearanceForm.addEventListener("reset", hideInfoWindow);
	document.forms.clearanceForm.addEventListener("submit", hideInfoWindow);

	// Setup route data list.
	routeLocator.getRouteList().then(function (response) {
		var routeBox, option, routes, list;

		if (typeof response === "string") {
			response = JSON.parse(response);
		}
		routes = response.Current;

		// Sort the items in the array by route name.
		routes.sort(function (routeA, routeB) {
			if (routeA.name === routeB.name) {
				return 0;
			} else if (routeA.name > routeB.name) {
				return 1;
			} else {
				return -1;
			}
		});

		routeBox = document.getElementById("routeFilterBox");
		list = document.createElement("datalist");
		list.id = "routeList";

		routes.forEach(function (/** {Route} */ r) {
			var v;
			if (r.name.length <= 3) {
				v = Number(r.name);
				option = document.createElement("option");
				option.value = v; // r.name;
				option.textContent = v;
				option.setAttribute("data-lrs-types", r.lrsTypes);
				list.appendChild(option);
			}
		});



		document.body.appendChild(list);
		////routeBox.setAttribute("list", list.id);
	});

	// Submit when the user modifies fields.
	(function (form, inputElements) {
		var i, l, input, f;
		f = function () {
			////hideResults();
			////bridgeOnLayer.clearSelection();
			////bridgeUnderLayer.clearSelection();
			form.onsubmit();
		};
		for (i = 0, l = inputElements.length; i < l; i++) {
			input = inputElements[i];
			input.addEventListener("change", f);
		}
	}(document.getElementById("clearanceForm"), document.getElementById("clearanceForm").querySelectorAll("input")));

	/**
	 * Converts an ELC route location into a graphic.
	 * @param {RouteLocation} routeLocation
	 * @returns {Graphic}
	 */
	function routeLocationToGraphic(routeLocation) {
		var ignoredFields = /(?:(?:Geometry)|(?:Point)|(?:id))/i;
		var graphic = {
			attributes: {

			},
			geometry: routeLocation.RouteGeometry,
			infoTemplate: {
				title: "${Route} @ MP ${Srmp}",
				content: "<dl><dt>Route</dt><dd>${Route}</dd><dt>Milepost</dt><dd>${Srmp}</dd></dl>"
			}
		};

		for (var name in routeLocation) {
			/*jshint eqnull:true*/
			if (routeLocation.hasOwnProperty(name) && !ignoredFields.test(name) && routeLocation[name] != null) {
				graphic.attributes[name] = routeLocation[name];
			}
			/*jshint eqnull:false*/
		}

		graphic = new Graphic(graphic);
		return graphic;
	}

	// Show an info window with the route location at the clicked point (if available).
	map.on("click", function (evt) {
		var mapPoint, graphicTagNames = /(?:(?:circle)|(?:path))/i;

		// Only proceed if the target is not a graphic.
		if (!graphicTagNames.test(evt.target.tagName)) {
			mapPoint = evt.mapPoint;
			routeLocator.findNearestRouteLocations({
				coordinates: [mapPoint.x, mapPoint.y],
				referenceDate: new Date(),
				searchRadius: 200,
				inSR: mapPoint.spatialReference.wkid,
				outSR: mapPoint.spatialReference.wkid,
				useCors: true,
				successHandler: function (elcResults) {
					if (elcResults.length) {
						map.infoWindow.setFeatures(elcResults.map(routeLocationToGraphic));
						map.infoWindow.show(mapPoint);
					}
				},
				errorHandler: function (error) {
					console.error("elc error", error); // eslint-disable-line no-console
				}
			});
		}


	});

});