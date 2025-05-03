package com.realestate.zoningupdate.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * DTO representing a cluster of parcels for map visualization
 * Used for efficient data loading at lower zoom levels
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ClusterDTO {
    // Center coordinates in [longitude, latitude] format (GeoJSON compatible)
    private double[] center;

    // Total count of parcels in this cluster
    private int count;

    // Breakdown of parcel counts by zoning type
    private Map<String, Integer> zoningBreakdown;

    // Bounding box for the cluster [west, south, east, north]
    private double[] bounds;
}