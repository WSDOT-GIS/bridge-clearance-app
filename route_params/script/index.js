(function () {

	function createTableFromObjectProperties(obj) {
		var table, row, cell1, cell2, cell3, rowSpan, innerObj, propName, innerPropName, checkbox, defaultValue, control;
		table = document.createElement("table");

		for (propName in obj) {
			if (obj.hasOwnProperty(propName)) {
				rowSpan = 0;
				innerObj = obj[propName];
				for (innerPropName in innerObj) {
					if (innerObj.hasOwnProperty(innerPropName)) {
						rowSpan += 1;
						row = table.insertRow(-1);
						if (rowSpan === 1) {
							cell1 = row.insertCell(-1);
							checkbox = document.createElement("input");
							checkbox.type = "checkbox";
							cell1.appendChild(checkbox);
							cell1.appendChild(document.createTextNode(propName));
						} else {
							cell1.setAttribute("rowspan", rowSpan);
						}
						cell2 = row.insertCell(-1);
						cell2.innerText = innerPropName;
						cell3 = row.insertCell(-1);
						defaultValue = innerObj[innerPropName];
						if (innerPropName === "Restriction Usage") {
							control = document.createElement("select");
							control.innerHTML = "<option selected value='" + defaultValue + "'>" + defaultValue + "</option>";
						} else {
							control = document.createElement("input");
							control.type = "number";
							control.defaultValue = defaultValue;
							control.value = defaultValue;
						}
						cell3.appendChild(control);
					}
				}
			}
			row = null;
			cell1 = null;
			cell2 = null;
		}
		

		return table;
	}

	function parseTabSeparatedData(text) {
		var re = /^([^\t\n\r]+)\t([^\t]+)\t([^\t]+)$/gm; // Matches ["restriction name", "parameter name", "default value"]
		var match;
		var output = {};
		match = re.exec(text);
		// Skip first row: column headings.
		match = re.exec(text);
		while (match) {
			// Remove the first element: the complete match.
			match = match.slice(1);
			
			if (!output.hasOwnProperty(match[0])) {
				output[match[0]] = {};
			}
			output[match[0]][match[1]] = match[2];

			match = re.exec(text);
		}
		return output;
	}

	function requestParameterValues(url, sectionId) {
		var section;
		if (!url) {
			throw new TypeError("The url parameter was not provided.");
		}
		section = document.getElementById(sectionId);
		if (!section) {
			throw new TypeError("The specified sectionId does not exist.");
		}
		var request = new XMLHttpRequest();
		request.open("get", url);
		request.onloadend = function () {
			var properties = parseTabSeparatedData(this.response);
			var table = createTableFromObjectProperties(properties);
			document.getElementById(sectionId).appendChild(table);
			console.log(properties);
		};
		request.send();
	}

	requestParameterValues("data/sync/Attribute Parameter Values.txt", "syncSection");
	requestParameterValues("data/async/Attribute Parameter Values.txt", "asyncSection");
}());