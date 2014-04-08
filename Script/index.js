/*global require*/
require(["esri/map", "esri/config", "esri/layers/FeatureLayer"], function (Map, esriConfig, FeatureLayer) {
	var map, bridgeLayer, ucNoDataLayer, ucMinVerticalClearanceLayer;

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

	map.on("load", function () {
		bridgeLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeService_demo/MapServer/2");
		bridgeLayer.on("error", onLayerError);
		map.addLayer(bridgeLayer);

		ucNoDataLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeService_demo/MapServer/4");
		ucNoDataLayer.on("error", onLayerError);
		map.addLayer(ucNoDataLayer);

		ucMinVerticalClearanceLayer = new FeatureLayer("http://hqolymgis99t/arcgis/rest/services/Bridges/BridgeService_demo/MapServer/5");
		ucMinVerticalClearanceLayer.on("error", onLayerError);
		map.addLayer(ucMinVerticalClearanceLayer);
	});
});