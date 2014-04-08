require(["esri/map"], function (Map) {
	var map;

	map = new Map("map", {
		basemap: "streets",
		center: [-120.80566406246835, 47.41322033015946],
		zoom: 7,
		showAttribution: true
	});
});