SELECT objectid
	,inches = 
		CASE VCMIN
			WHEN 9999 THEN NULL
			ELSE ROUND(VCMIN / 100, 0) * 12 + VCMIN % 100
		END
	, reported_inches = 
		CASE VCMIN
			WHEN 9999 THEN NULL
			ELSE (ROUND(VCMIN / 100, 0) * 12 + VCMIN % 100) - 3
		END
,structure_id, bridge_no, location_gid, directional_indicator_LOC, arm_beg, arm_end, StackOrder, lrs_route, lrs_traffic_flow_beg, ahead_back_indicator_1, Latitude, 
                  Longitude, crossing_description, facilities_carried, feature_intersected, structure_length, VCMAX, VCMIN, vert_clrnc_route_max, vert_clrnc_route_min, vert_clrnc_rvrs_max, 
                  vert_clrnc_rvrs_min, min_vert_deck, on_under_code, RP, SHAPE
FROM     dbo.BRIDGEUNDERLOCATIONS AS unders