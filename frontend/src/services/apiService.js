import axios from 'axios';
import {
  initMockData,
  getMockGeoJSON,
  updateMockGeoJSON,
  getMockStatistics,
  updateMockStatistics,
  calculateZoningStatistics,
  getMockGeoJSONByBounds,
  getMockClustersByBounds,
  getMockAuditLogs,
} from '../utils/mockDataHandler';

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || 'http://localhost:8080/api';
const USE_MOCK_DATA = process.env.REACT_APP_MOCK_DATA === 'true';

// Initialize mock data if using mock mode
if (USE_MOCK_DATA) {
  initMockData();
}

// Configure axios with defaults
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15 seconds timeout for potentially large GeoJSON
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for logging
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for logging
api.interceptors.response.use(
  (response) => {
    // Calculate and log data size
    const dataSize = JSON.stringify(response.data).length / 1024;
    return response;
  },
  (error) => {
    console.error('API Response Error:', error);
    return Promise.reject(error);
  }
);

const apiService = {
  // Fetch all parcels as GeoJSON
  getAllParcelsGeoJSON: async () => {
    // Use mock data if mock mode is enabled
    if (USE_MOCK_DATA) {
      // Simulate network delay for realistic testing
      await new Promise((resolve) => setTimeout(resolve, 500));

      return getMockGeoJSON();
    }

    try {
      const response = await api.get('/parcels/geojson');
      return response.data;
    } catch (error) {
      console.error('Error fetching parcels as GeoJSON:', error);
      throw error;
    }
  },

  // Fetch parcels by bounds - THIS IS THE MAIN METHOD FOR DYNAMIC LOADING
  getParcelsByBounds: async (north, south, east, west) => {
    // Use mock data if mock mode is enabled
    if (USE_MOCK_DATA) {
      // Simulate network delay for realistic testing
      await new Promise((resolve) => setTimeout(resolve, 300));

      const result = getMockGeoJSONByBounds(north, south, east, west);
      return result;
    }

    try {
      const response = await api.get('/parcels/geojson/bounds', {
        params: { north, south, east, west },
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching parcels by bounds:', error);
      throw error;
    }
  },

  // Fetch parcel clusters for a specified area
  getParcelClusters: async (north, south, east, west, zoom) => {
    // Use mock data if mock mode is enabled
    if (USE_MOCK_DATA) {
      // Simulate network delay for realistic testing
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Generate mock clusters if no handler is provided
      const mockClusters = getMockClustersByBounds(
        north,
        south,
        east,
        west,
        zoom
      );
      return mockClusters;
    }

    try {
      // Call the backend endpoint for clusters
      const response = await api.get('/parcels/clusters', {
        params: { north, south, east, west, zoom },
      });

      // Validate the response structure
      if (Array.isArray(response.data)) {
        // Format the data properly, ensuring it matches what the UI expects
        const formattedClusters = response.data.map((cluster) => {
          return {
            center: Array.isArray(cluster.center) ? cluster.center : [0, 0],
            count: cluster.count || 0,
            zoningBreakdown: cluster.zoningBreakdown || {},
            bounds: Array.isArray(cluster.bounds) ? cluster.bounds : null,
          };
        });

        return formattedClusters;
      } else {
        console.error('Unexpected cluster data format:', response.data);
        throw new Error('Invalid cluster data format from API');
      }
    } catch (error) {
      console.error('Error fetching parcel clusters:', error);
      // For graceful fallback, generate some basic clusters on failure
      const fallbackClusters = getMockClustersByBounds(
        north,
        south,
        east,
        west,
        zoom
      );
      console.warn('Using fallback generated clusters due to API failure');
      return fallbackClusters;
    }
  },

  // Update zoning for selected parcels
  updateZoning: async (
    parcelIds,
    zoningType,
    zoningSubType,
    username = 'user'
  ) => {
    // Use mock data if mock mode is enabled
    if (USE_MOCK_DATA) {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      try {
        // Get current mock data
        const mockGeoJSON = getMockGeoJSON();

        // Update zoning for selected parcels
        const updatedGeoJSON = {
          ...mockGeoJSON,
          features: mockGeoJSON.features.map((feature) => {
            if (parcelIds.includes(feature.properties.id)) {
              return {
                ...feature,
                properties: {
                  ...feature.properties,
                  zoning_typ: zoningType,
                  zoning_sub: zoningSubType,
                },
              };
            }
            return feature;
          }),
        };

        // Save updated GeoJSON
        updateMockGeoJSON(updatedGeoJSON);

        // Recalculate and save statistics
        const statistics = calculateZoningStatistics(updatedGeoJSON);
        updateMockStatistics(statistics);

        return {
          success: true,
          message: `Successfully updated ${parcelIds.length} parcels`,
        };
      } catch (error) {
        console.error('Error updating mock data:', error);
        throw new Error('Failed to update mock zoning data');
      }
    }

    try {
      const response = await api.post('/parcels/update-zoning', {
        parcelIds,
        zoningType,
        zoningSubType,
        username,
      });
      return response.data;
    } catch (error) {
      console.error('Error updating zoning:', error);
      throw error;
    }
  },

  // Get zoning statistics
  getZoningStatistics: async () => {
    // Use mock data if mock mode is enabled
    if (USE_MOCK_DATA) {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      return getMockStatistics();
    }

    try {
      const response = await api.get('/parcels/statistics');
      return response.data;
    } catch (error) {
      console.error('Error fetching zoning statistics:', error);
      throw error;
    }
  },

  // Get audit logs
  getAuditLogs: async () => {
    if (USE_MOCK_DATA) {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Return mock audit logs
      return getMockAuditLogs();
    }

    // Your existing API call for non-mock mode
    try {
      const response = await api.get('/audit/logs');
      return response.data;
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      throw error;
    }
  },
};

export default apiService;
