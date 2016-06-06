SELECT
	objectid
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
	,structure_id, bridge_no, location_gid, directional_indicator_LOC, arm_beg, lrs_traffic_flow_end, ahead_back_indicator_2, arm_end, Latitude_beg, Longitude_beg, 
                  Latitude_end, Longitude_end, StackOrder, lrs_route, lrs_traffic_flow_beg, BeginAheadBackInd, crossing_description, facilities_carried, feature_intersected, 
                  structure_length, VCMAX, VCMIN, vert_clrnc_route_max, vert_clrnc_route_min, vert_clrnc_rvrs_max, vert_clrnc_rvrs_min, min_vert_deck, control_data_gid, record_gid, 
                  on_under_code, RP
				  
				  ,SHAPE
FROM     dbo.BRIDGEONLOCATIONS AS ons