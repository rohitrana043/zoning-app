import mockGeoJSONData from '../mock-data/mock-geojson.json';
import mockStatisticsData from '../mock-data/mock-statistics.json';
import mockAuditLogsData from '../mock-data/mock-audit-logs.json';

// Initialize localStorage with mock data if not already present
export const initMockData = () => {
  if (!localStorage.getItem('mockGeoJSON')) {
    localStorage.setItem('mockGeoJSON', JSON.stringify(mockGeoJSONData));
  }

  if (!localStorage.getItem('mockStatistics')) {
    localStorage.setItem('mockStatistics', JSON.stringify(mockStatisticsData));
  }

  if (!localStorage.getItem('mockAuditLogs')) {
    localStorage.setItem('mockAuditLogs', JSON.stringify(mockAuditLogsData));
  }
};

// Get mock GeoJSON data from localStorage
export const getMockGeoJSON = () => {
  const data = localStorage.getItem('mockGeoJSON');
  return data ? JSON.parse(data) : mockGeoJSONData;
};

// Update mock GeoJSON data in localStorage
export const updateMockGeoJSON = (data) => {
  localStorage.setItem('mockGeoJSON', JSON.stringify(data));
};

// Get mock statistics data from localStorage
export const getMockStatistics = () => {
  const data = localStorage.getItem('mockStatistics');
  return data ? JSON.parse(data) : mockStatisticsData;
};

export const getMockAuditLogs = () => {
  const data = localStorage.getItem('mockAuditLogs');
  return data ? JSON.parse(data) : mockAuditLogsData;
};

// Update mock statistics data in localStorage
export const updateMockStatistics = (data) => {
  localStorage.setItem('mockStatistics', JSON.stringify(data));
};

// Calculate zoning statistics from GeoJSON data
export const calculateZoningStatistics = (geoJSONData) => {
  const zoneCounts = {};

  geoJSONData.features.forEach((feature) => {
    const zoneType = feature.properties.zoning_typ || 'Unknown';
    zoneCounts[zoneType] = (zoneCounts[zoneType] || 0) + 1;
  });

  return zoneCounts;
};

// Reset mock data to initial values
export const resetMockData = () => {
  localStorage.setItem('mockGeoJSON', JSON.stringify(mockGeoJSONData));
  localStorage.setItem('mockStatistics', JSON.stringify(mockStatisticsData));
  localStorage.setItem('mockAuditLogs', JSON.stringify(mockAuditLogsData));
};

// Check if a point is within bounds
const isPointInBounds = (lon, lat, west, south, east, north) => {
  return lon >= west && lon <= east && lat >= south && lat <= north;
};

// Check if a polygon intersects with bounds
const doesPolygonIntersectBounds = (coords, west, south, east, north) => {
  // Check if any point of the polygon is within bounds
  for (const coord of coords) {
    const lon = coord[0];
    const lat = coord[1];
    if (isPointInBounds(lon, lat, west, south, east, north)) {
      return true;
    }
  }

  // If no points are within the bounds, check if the polygon surrounds the bounds
  // This is a simplified approach - full polygon intersection would be more complex

  // Get min/max coordinates of polygon
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;

  for (const coord of coords) {
    const lon = coord[0];
    const lat = coord[1];

    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  // Check if the polygon completely contains the bounds
  if (minLon <= west && maxLon >= east && minLat <= south && maxLat >= north) {
    return true;
  }

  // If we're here, the polygon doesn't intersect with bounds
  return false;
};

// Get mock GeoJSON data filtered by bounds
export const getMockGeoJSONByBounds = (north, south, east, west) => {
  // Get all mock data
  const allData = getMockGeoJSON();

  if (!allData || !allData.features || allData.features.length === 0) {
    return { type: 'FeatureCollection', features: [] };
  }

  // Filter features based on bounds
  const filteredFeatures = allData.features.filter((feature) => {
    try {
      // Skip features without valid geometry
      if (
        !feature.geometry ||
        !feature.geometry.coordinates ||
        feature.geometry.coordinates.length === 0
      ) {
        return false;
      }

      // Handle different geometry types
      switch (feature.geometry.type) {
        case 'Polygon':
          // For polygons, check each ring
          return feature.geometry.coordinates.some((ring) =>
            doesPolygonIntersectBounds(ring, west, south, east, north)
          );

        case 'MultiPolygon':
          // For multi-polygons, check each polygon's rings
          return feature.geometry.coordinates.some((polygon) =>
            polygon.some((ring) =>
              doesPolygonIntersectBounds(ring, west, south, east, north)
            )
          );

        case 'Point':
          // For points, simply check if within bounds
          const [lon, lat] = feature.geometry.coordinates;
          return isPointInBounds(lon, lat, west, south, east, north);

        case 'LineString':
          // For lines, check if any point is within bounds
          return doesPolygonIntersectBounds(
            feature.geometry.coordinates,
            west,
            south,
            east,
            north
          );

        default:
          return false;
      }
    } catch (error) {
      console.error('Error checking bounds for feature:', error);
      return false;
    }
  });
  // Return filtered data
  return {
    type: 'FeatureCollection',
    features: filteredFeatures,
  };
};

// Generate mock clusters for the given bounds and zoom level
export const getMockClustersByBounds = (north, south, east, west, zoom) => {
  const geojson = getMockGeoJSON();
  const features = geojson.features || [];

  const gridSize = Math.max(1, 15 - zoom);
  const latStep = (north - south) / gridSize;
  const lngStep = (east - west) / gridSize;

  const clusters = [];

  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const cellSouth = south + i * latStep;
      const cellNorth = cellSouth + latStep;
      const cellWest = west + j * lngStep;
      const cellEast = cellWest + lngStep;

      const cellCenterLat = (cellSouth + cellNorth) / 2;
      const cellCenterLng = (cellWest + cellEast) / 2;

      const zoningBreakdown = {
        Residential: 0,
        Commercial: 0,
        Planned: 0,
        Unknown: 0,
      };

      let count = 0;

      for (const feature of features) {
        if (!feature.geometry || !feature.geometry.coordinates) continue;

        const coords =
          feature.geometry.type === 'Polygon'
            ? feature.geometry.coordinates[0]
            : feature.geometry.type === 'Point'
            ? [feature.geometry.coordinates]
            : [];

        for (const [lon, lat] of coords) {
          if (
            lat >= cellSouth &&
            lat <= cellNorth &&
            lon >= cellWest &&
            lon <= cellEast
          ) {
            count++;
            const zone = feature.properties.zoning_typ || 'Unknown';
            if (zoningBreakdown[zone] !== undefined) {
              zoningBreakdown[zone]++;
            } else {
              zoningBreakdown.Unknown++;
            }
            break; // one hit is enough per feature
          }
        }
      }

      if (count > 0) {
        clusters.push({
          center: [cellCenterLng, cellCenterLat],
          count,
          zoningBreakdown,
          bounds: [cellWest, cellSouth, cellEast, cellNorth],
        });
      }
    }
  }

  return clusters;
};
