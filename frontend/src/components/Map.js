import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
  Tooltip,
  Popup,
  CircleMarker,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import apiService from '../services/apiService';

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ZONING_COLORS = {
  Residential: '#66bb6a',
  Commercial: '#42a5f5',
  Planned: '#ffeb3b',
  Unknown: '#cccccc',
};

// Initial map center
const DEFAULT_CENTER = [32.9672, -96.7812];
const DEFAULT_ZOOM = 16;

// Zoom level thresholds
const CLUSTERS_ONLY_ZOOM = 17; // Below this zoom, show only clusters
const FULL_DETAIL_ZOOM = 17; // Above this zoom, show full parcel details

// Custom DivOverlay component for cluster labels
const DivOverlay = ({ center, html }) => {
  const map = useMap();
  const divRef = useRef(null);

  useEffect(() => {
    if (!map || !center || !html) return;

    // Create a custom div icon for the label
    const customIcon = L.divIcon({
      html: html,
      className: 'custom-div-icon',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    // Create marker with the custom icon
    const marker = L.marker(center, {
      icon: customIcon,
      interactive: false,
      keyboard: false,
    }).addTo(map);

    divRef.current = marker;

    return () => {
      if (marker && map) {
        map.removeLayer(marker);
      }
    };
  }, [map, center, html]);

  return null;
};

// Custom hook to disable map click
const DisableMapClick = () => {
  const map = useMap();

  useEffect(() => {
    // Disable closePopupOnClick
    map.options.closePopupOnClick = false;

    // Add a click handler that stops propagation - critical for popups
    const clickHandler = (e) => {
      if (!e._stopped) {
        e._stopped = true;
        L.DomEvent.stopPropagation(e);
      }
    };

    map.on('click', clickHandler);

    return () => {
      map.off('click', clickHandler);
    };
  }, [map]);

  return null;
};

const ParcelMap = ({
  selectedParcels,
  onParcelSelect,
  onVisibleDataChange,
}) => {
  const [geoJsonData, setGeoJsonData] = useState({
    type: 'FeatureCollection',
    features: [],
  });
  const [clusterData, setClusterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingBounds, setLoadingBounds] = useState(false);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);

  // Request cache references
  const pendingRequestsRef = useRef(new Set());
  const failedRequestsRef = useRef(new Set());
  const boundsChangeTimerRef = useRef(null);
  const lastRequestedBoundsRef = useRef(null);

  // Other refs
  const geoJsonLayerRef = useRef(null);
  const loadedAreasRef = useRef([]);
  const loadedClustersRef = useRef([]);
  const isLoadingAllRef = useRef(false);
  const activePopupRef = useRef(null);
  const lastClusterClickRef = useRef(0);

  // Maximum number of retries
  const MAX_RETRIES = 3;

  // Request caching functions
  const isRequestCached = useCallback((bounds) => {
    const boundsString = `${bounds.getNorth()},${bounds.getSouth()},${bounds.getEast()},${bounds.getWest()}`;

    // Check if this request is pending or has failed recently
    return (
      pendingRequestsRef.current.has(boundsString) ||
      failedRequestsRef.current.has(boundsString)
    );
  }, []);

  const markRequestPending = useCallback((bounds) => {
    const boundsString = `${bounds.getNorth()},${bounds.getSouth()},${bounds.getEast()},${bounds.getWest()}`;
    pendingRequestsRef.current.add(boundsString);
    return boundsString;
  }, []);

  const markRequestCompleted = useCallback((boundsString) => {
    pendingRequestsRef.current.delete(boundsString);
  }, []);

  const markRequestFailed = useCallback((boundsString) => {
    pendingRequestsRef.current.delete(boundsString);
    failedRequestsRef.current.add(boundsString);

    // Remove from failed requests after 30 seconds to allow retrying later
    setTimeout(() => {
      failedRequestsRef.current.delete(boundsString);
    }, 30000);
  }, []);

  // Clear loaded areas when zoom changes significantly
  useEffect(() => {
    // Clear detailed loading history when zoom drops below threshold
    if (currentZoom < FULL_DETAIL_ZOOM) {
      // Only keep clusters, clear detailed areas
      loadedAreasRef.current = [];
    }

    // Clear cluster history when zoom is very low
    if (currentZoom < CLUSTERS_ONLY_ZOOM) {
      loadedClustersRef.current = [];
    }
  }, [currentZoom]);

  // Function to track visible features
  const updateVisibleFeatures = useCallback(() => {
    if (!geoJsonLayerRef.current || !onVisibleDataChange) return;

    // Get the current map bounds
    const map = geoJsonLayerRef.current._map;
    if (!map) {
      return;
    }

    const bounds = map.getBounds();
    // Find features that are currently in view
    const visibleFeatures = {
      type: 'FeatureCollection',
      features: [],
    };

    // Check each feature in the loaded data
    if (geoJsonData && geoJsonData.features) {
      visibleFeatures.features = geoJsonData.features.filter((feature) => {
        // Skip features with invalid geometry
        if (!feature.geometry || !feature.geometry.coordinates) return false;

        try {
          // For polygon features
          if (feature.geometry.type === 'Polygon') {
            // Check if ANY point of the polygon is within the bounds
            return feature.geometry.coordinates[0].some((coord) => {
              // Leaflet uses [lat, lng] while GeoJSON uses [lng, lat]
              return bounds.contains([coord[1], coord[0]]);
            });
          }
          return false;
        } catch (e) {
          console.error('Error checking feature visibility:', e);
          return false;
        }
      });
    }
    onVisibleDataChange(visibleFeatures);
  }, [geoJsonData, onVisibleDataChange]);

  // Determine what to load based on current zoom level
  const getLoadStrategy = useCallback((zoom) => {
    if (zoom < CLUSTERS_ONLY_ZOOM) {
      return 'clusters_only';
    } else if (zoom < FULL_DETAIL_ZOOM) {
      return 'sparse_parcels';
    } else {
      return 'full_detail';
    }
  }, []);

  // Component to handle map events and load data dynamically
  const MapEventHandler = ({ onBoundsChange, loadAllData }) => {
    const map = useMap();
    const initialLoadRef = useRef(false);
    const moveEndTimerRef = useRef(null);

    // Handle zoom change
    const handleZoomChange = useCallback(() => {
      const zoom = map.getZoom();
      setCurrentZoom(zoom);
    }, [map]);

    // Initial load - only happens once
    useEffect(() => {
      // Only run this effect if map exists and hasn't been initialized
      if (!map || initialLoadRef.current) return;

      // Mark as initialized
      initialLoadRef.current = true;

      // Get initial map state
      const initialBounds = map.getBounds();
      const initialZoom = map.getZoom();

      // Set initial zoom state
      if (initialZoom !== currentZoom) {
        setCurrentZoom(initialZoom);
      }

      // Use timeout for initial load to ensure component is fully mounted
      const timer = setTimeout(() => {
        onBoundsChange(initialBounds, initialZoom);
      }, 500);

      return () => clearTimeout(timer);
    }, [map]); // ONLY depend on map reference

    // Listen for map movement and zoom events with debouncing
    useMapEvents({
      moveend: () => {
        if (moveEndTimerRef.current) {
          clearTimeout(moveEndTimerRef.current);
        }

        moveEndTimerRef.current = setTimeout(() => {
          const bounds = map.getBounds();
          onBoundsChange(bounds, map.getZoom());
          updateVisibleFeatures();
        }, 300);
      },
      zoomend: () => {
        if (moveEndTimerRef.current) {
          clearTimeout(moveEndTimerRef.current);
        }

        moveEndTimerRef.current = setTimeout(() => {
          const bounds = map.getBounds();
          const zoom = map.getZoom();
          handleZoomChange();
          onBoundsChange(bounds, zoom);
          updateVisibleFeatures();
        }, 300);
      },
    });

    return null;
  };

  // Effect to update visible features when map or data changes
  useEffect(() => {
    if (geoJsonData && geoJsonData.features) {
      updateVisibleFeatures();
    }
  }, [geoJsonData, updateVisibleFeatures]);

  // Merge two GeoJSON datasets avoiding duplicates
  const mergeGeoJsonData = useCallback((existingData, newData) => {
    if (!existingData || !existingData.features) {
      return newData;
    }
    if (!newData || !newData.features || newData.features.length === 0) {
      return existingData;
    }

    // Get all existing feature IDs for quick lookup
    const existingIds = new Set(
      existingData.features.map((feature) => feature.properties.id)
    );

    // Only add features that don't already exist
    const filteredNewFeatures = newData.features.filter(
      (feature) => !existingIds.has(feature.properties.id)
    );

    // Return merged data
    return {
      ...existingData,
      features: [...existingData.features, ...filteredNewFeatures],
    };
  }, []);

  // Function to check if a bounds area has been loaded
  const isBoundsLoaded = useCallback(
    (bounds, zoom) => {
      const strategy = getLoadStrategy(zoom);

      // Function to check if bounds areas overlap significantly (>50%)
      const boundsOverlapSignificantly = (bounds1, bounds2) => {
        // Calculate area of bounds1
        const width1 = bounds1[2] - bounds1[0];
        const height1 = bounds1[3] - bounds1[1];
        const area1 = width1 * height1;

        // Calculate overlap area
        const overlapWest = Math.max(bounds1[0], bounds2[0]);
        const overlapSouth = Math.max(bounds1[1], bounds2[1]);
        const overlapEast = Math.min(bounds1[2], bounds2[2]);
        const overlapNorth = Math.min(bounds1[3], bounds2[3]);

        // If there's no overlap, return false
        if (overlapWest >= overlapEast || overlapSouth >= overlapNorth) {
          return false;
        }

        // Calculate overlap area
        const overlapWidth = overlapEast - overlapWest;
        const overlapHeight = overlapNorth - overlapSouth;
        const overlapArea = overlapWidth * overlapHeight;

        // If overlap area is > 50% of bounds1 area, return true
        return overlapArea > area1 * 0.5;
      };

      // If we're looking at parcels in detail
      if (strategy === 'full_detail' || strategy === 'sparse_parcels') {
        if (loadedAreasRef.current.length === 0) return false;

        const boundingBox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];

        // Check if this area is fully contained in any previously loaded area
        // or has significant overlap
        return loadedAreasRef.current.some(
          (area) =>
            (area[0] <= boundingBox[0] && // west
              area[1] <= boundingBox[1] && // south
              area[2] >= boundingBox[2] && // east
              area[3] >= boundingBox[3]) || // north
            boundsOverlapSignificantly(area, boundingBox)
        );
      }
      // If we're looking at clusters
      else if (
        strategy === 'clusters_only' ||
        strategy === 'clusters_and_some_parcels'
      ) {
        if (loadedClustersRef.current.length === 0) return false;

        const boundingBox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];

        // Check if this area is fully contained in any previously loaded cluster area
        // or has significant overlap
        return loadedClustersRef.current.some(
          (area) =>
            (area[0] <= boundingBox[0] && // west
              area[1] <= boundingBox[1] && // south
              area[2] >= boundingBox[2] && // east
              area[3] >= boundingBox[3]) || // north
            boundsOverlapSignificantly(area, boundingBox)
        );
      }

      return false;
    },
    [getLoadStrategy]
  );

  // Initial setup - prepare for loading
  useEffect(() => {
    setLoading(false);
  }, []);

  // Handle map bounds change - this is the core of dynamic loading!
  const handleBoundsChange = useCallback(
    (bounds, zoom) => {
      // Clear any pending timer
      if (boundsChangeTimerRef.current) {
        clearTimeout(boundsChangeTimerRef.current);
      }

      // Debounce map movement events
      boundsChangeTimerRef.current = setTimeout(async () => {
        // Skip if loading all data
        if (isLoadingAllRef.current) return;

        const loadStrategy = getLoadStrategy(zoom);

        // Create bounds string for comparison
        const boundsString = `${bounds.getNorth()},${bounds.getSouth()},${bounds.getEast()},${bounds.getWest()}`;

        // Skip if this is the exact same bounds as last request
        if (lastRequestedBoundsRef.current === boundsString) {
          console.log('Skipping duplicate bounds request');
          return;
        }

        // Skip if this request is cached (pending or recently failed)
        if (isRequestCached(bounds)) {
          console.log('Skipping cached request');
          return;
        }

        // Skip if this area has already been loaded for current strategy
        if (isBoundsLoaded(bounds, zoom)) {
          console.log('Area already loaded for current zoom level');
          return;
        }

        // Store current bounds as last requested
        lastRequestedBoundsRef.current = boundsString;

        // Mark this request as pending
        const requestId = markRequestPending(bounds);

        try {
          setLoadingBounds(true);

          const north = bounds.getNorth();
          const south = bounds.getSouth();
          const east = bounds.getEast();
          const west = bounds.getWest();

          // Add padding to avoid too frequent requests near edges (10% padding)
          const paddedBounds = [
            west - (east - west) * 0.1, // padded west
            south - (north - south) * 0.1, // padded south
            east + (east - west) * 0.1, // padded east
            north + (north - south) * 0.1, // padded north
          ];

          if (
            loadStrategy === 'clusters_only' ||
            loadStrategy === 'clusters_and_some_parcels'
          ) {
            try {
              // Fetch cluster data
              const clusters = await apiService.getParcelClusters(
                paddedBounds[3], // north
                paddedBounds[1], // south
                paddedBounds[2], // east
                paddedBounds[0], // west
                zoom
              );

              // Mark request as completed
              markRequestCompleted(requestId);

              // Add this area to loaded clusters to avoid reloading
              loadedClustersRef.current.push(paddedBounds);

              // Update cluster state
              setClusterData((prevClusters) => [...clusters]);
            } catch (error) {
              console.error('Error loading clusters:', error);
              markRequestFailed(requestId);
            }
          } else {
            try {
              // Get parcels from API based on current bounds with full detail
              const data = await apiService.getParcelsByBounds(
                paddedBounds[3], // north
                paddedBounds[1], // south
                paddedBounds[2], // east
                paddedBounds[0] // west
              );

              // Mark request as completed
              markRequestCompleted(requestId);

              if (data && data.features) {
                // Add this area to loaded areas to avoid reloading it
                loadedAreasRef.current.push(paddedBounds);

                // Merge with existing data
                setGeoJsonData((prevData) => mergeGeoJsonData(prevData, data));
              }
            } catch (error) {
              console.error('Error loading parcel data:', error);
              markRequestFailed(requestId);
            }
          }
        } catch (error) {
          console.error('Error loading data by bounds:', error);
          markRequestFailed(requestId);
        } finally {
          setLoadingBounds(false);
        }
      }, 300); // 300ms debounce
    },
    [
      getLoadStrategy,
      isBoundsLoaded,
      mergeGeoJsonData,
      isRequestCached,
      markRequestPending,
      markRequestCompleted,
      markRequestFailed,
    ]
  );

  // Update the GeoJSON layer style when selected parcels change
  useEffect(() => {
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.setStyle((feature) => getParcelStyle(feature));
    }
  }, [selectedParcels]);

  // Style function for the GeoJSON layer
  const getParcelStyle = useCallback(
    (feature) => {
      const isSelected = selectedParcels.includes(feature.properties.id);
      const zoningType = feature.properties.zoning_typ;

      return {
        fillColor: getZoningColor(zoningType),
        weight: isSelected ? 3 : 1,
        opacity: 1,
        color: isSelected ? '#ff0000' : '#333333',
        fillOpacity: isSelected ? 0.7 : 0.5,
      };
    },
    [selectedParcels]
  );

  // Get color based on zoning type
  const getZoningColor = useCallback((zoningType) => {
    if (!zoningType) return ZONING_COLORS.Unknown;
    return ZONING_COLORS[zoningType] || ZONING_COLORS.Unknown;
  }, []);

  // Handle cluster click
  const handleClusterClick = useCallback(
    (cluster) => {
      const map = geoJsonLayerRef.current?._map;
      if (!map) return;

      try {
        // Prevent too frequent clicks
        if (Date.now() - lastClusterClickRef.current < 500) return;
        lastClusterClickRef.current = Date.now();

        // Calculate appropriate zoom level based on cluster size
        let zoomIncrement;
        const count = cluster.count || 0;

        // Determine zoom increment based on cluster size
        if (count > 3000) {
          zoomIncrement = 1; // Small increment for very large clusters
        } else if (count > 1000) {
          zoomIncrement = 2; // Medium increment for large clusters
        } else if (count > 100) {
          zoomIncrement = 2; // Medium increment for medium clusters
        } else {
          zoomIncrement = 3; // Larger increment for small clusters
        }

        // Calculate target zoom level, capped at FULL_DETAIL_ZOOM - 1
        const targetZoom = Math.min(
          currentZoom + zoomIncrement,
          FULL_DETAIL_ZOOM - 1
        );

        // If cluster has bounds, use them
        if (
          cluster.bounds &&
          Array.isArray(cluster.bounds) &&
          cluster.bounds.length >= 4
        ) {
          // Create and pad the bounds
          const sw = L.latLng(cluster.bounds[1], cluster.bounds[0]);
          const ne = L.latLng(cluster.bounds[3], cluster.bounds[2]);
          const bounds = L.latLngBounds(sw, ne);

          // Use fitBounds with max zoom restriction
          map.fitBounds(bounds.pad(0.2), {
            animate: true,
            duration: 0.8,
            maxZoom: targetZoom,
          });
        } else if (cluster.center && Array.isArray(cluster.center)) {
          // Fly to center with calculated zoom
          map.flyTo(
            [cluster.center[1], cluster.center[0]], // [lat, lng]
            targetZoom,
            { animate: true, duration: 0.8 }
          );
        }
      } catch (error) {
        console.error('Error handling cluster click:', error);
        // Fallback - just increase zoom
        if (map) map.setZoom(Math.min(currentZoom + 1, FULL_DETAIL_ZOOM - 1));
      }
    },
    [currentZoom]
  );

  // This is the critical function that handles both selection and popups
  const onEachFeature = useCallback(
    (feature, layer) => {
      // Create the popup content (formatted HTML)
      const popupContent = `
        <div style="min-width: 200px;">
          <strong>Parcel ID:</strong> ${feature.properties.id}<br/>
          <strong>Owner:</strong> ${feature.properties.owner || 'N/A'}<br/>
          <strong>Address:</strong> ${feature.properties.mailadd || 'N/A'}<br/>
          <strong>City/ZIP:</strong> ${feature.properties.mail_city || 'N/A'} ${
        feature.properties.mail_zip || ''
      }<br/>
          <strong>Current Zoning:</strong> ${
            feature.properties.zoning_typ || 'N/A'
          }<br/>
          <strong>Zoning Sub-Type:</strong> ${
            feature.properties.zoning_sub || 'N/A'
          }<br/>
        </div>
      `;

      // IMPORTANT: Create a standalone popup that doesn't auto-close
      const popup = L.popup({
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        className: 'persistent-popup',
        maxWidth: 300,
      });

      // Set content and associate with layer but don't bind
      popup.setContent(popupContent);

      // Add custom click handler with stronger event control
      layer.on('click', function (e) {
        // Stop propagation at multiple levels to be extra safe
        e._stopped = true;
        e.originalEvent._stopped = true;
        L.DomEvent.stopPropagation(e);
        L.DomEvent.preventDefault(e);

        // Close any existing popup first to avoid multiple popups
        if (activePopupRef.current) {
          activePopupRef.current.remove();
        }

        // Open popup at clicked location
        popup.setLatLng(e.latlng).openOn(e.target._map);

        // Store reference to currently open popup
        activePopupRef.current = popup;

        // Handle parcel selection (with delay to avoid conflicts)
        setTimeout(() => {
          onParcelSelect(feature.properties.id);
        }, 10);
      });
    },
    [onParcelSelect]
  );

  // Function to reference the GeoJSON layer
  const onGeoJSONLoad = useCallback((layer) => {
    geoJsonLayerRef.current = layer;
  }, []);

  // Handle retry button click
  const handleRetry = () => {
    if (retryCount < MAX_RETRIES) {
      setRetryCount((prev) => prev + 1);
    }
  };

  // Determine what to render based on zoom level
  const shouldShowGeoJSON = useMemo(() => {
    return currentZoom >= CLUSTERS_ONLY_ZOOM;
  }, [currentZoom]);

  // Determine if we should show clusters
  const shouldShowClusters = useMemo(() => {
    return currentZoom < FULL_DETAIL_ZOOM;
  }, [currentZoom]);

  // Debounced update of visible features
  useEffect(() => {
    // Only update visible features when map is ready and data exists
    if (
      geoJsonLayerRef.current?._map &&
      geoJsonData?.features?.length > 0 &&
      onVisibleDataChange
    ) {
      const updateVisibleFeaturesDebounced = setTimeout(() => {
        updateVisibleFeatures();
      }, 200); // Add debounce to prevent too frequent updates

      return () => clearTimeout(updateVisibleFeaturesDebounced);
    }
  }, [geoJsonData, currentZoom, updateVisibleFeatures, onVisibleDataChange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[600px] bg-gray-100 rounded-lg">
        <div className="text-xl text-gray-600">Loading map data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-gray-100 rounded-lg p-6 text-center">
        <p className="text-red-600 text-lg mb-4">{error}</p>
        {retryCount < MAX_RETRIES && (
          <button className="btn btn-primary" onClick={handleRetry}>
            Retry ({MAX_RETRIES - retryCount} attempts left)
          </button>
        )}
        {process.env.REACT_APP_MOCK_DATA !== 'true' &&
          retryCount >= MAX_RETRIES && (
            <p className="text-gray-500 text-sm mt-4">
              Consider enabling mock data mode for offline development.
            </p>
          )}
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden shadow-md mb-6">
      {/* Add custom CSS for popups and clusters */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
  .persistent-popup .leaflet-popup-content {
    margin: 8px 12px;
    line-height: 1.5;
  }
  .persistent-popup .leaflet-popup-content-wrapper {
    padding: 2px;
    border-radius: 4px;
  }
  .persistent-popup .leaflet-popup-tip-container {
    margin-top: -1px;
  }
  .cluster-label {
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(255, 255, 255, 0.8);
    color: #333;
    border-radius: 50%;
    width: 30px;
    height: 30px;
    font-weight: bold;
    font-size: 12px;
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
  .custom-div-icon {
    background: none;
    border: none;
  }
  .cluster-tooltip .leaflet-tooltip {
    background: transparent;
    border: none;
    box-shadow: none;
    color: white;
    font-weight: bold;
    text-shadow: 1px 1px 1px rgba(0,0,0,0.6);
  }
`,
        }}
      />

      {process.env.REACT_APP_MOCK_DATA === 'true' && (
        <div className="absolute top-3 left-3 z-[1000] bg-orange-500 bg-opacity-80 text-white px-3 py-1 rounded text-sm font-medium">
          Using Mock Data
        </div>
      )}

      {loadingBounds && (
        <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-[1000] bg-blue-500 bg-opacity-80 text-white px-4 py-2 rounded text-sm font-medium shadow-md animate-pulse">
          Loading data...
        </div>
      )}

      <div className="absolute top-3 right-3 z-[1000] bg-white bg-opacity-90 px-3 py-1 rounded text-sm">
        Zoom Level: {currentZoom.toFixed(1)} - {getLoadStrategy(currentZoom)}
      </div>

      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '600px', width: '100%' }}
        className="z-0"
        attributionControl={false}
        closePopupOnClick={false} // Important: disable popup auto-closing
      >
        {/* Custom component to disable map click behavior */}
        <DisableMapClick />

        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />

        {/* Render GeoJSON parcels if needed based on zoom */}
        {shouldShowGeoJSON &&
          geoJsonData &&
          geoJsonData.features &&
          geoJsonData.features.length > 0 && (
            <GeoJSON
              key={`geojson-${Date.now()}`} // Force re-render when data changes
              data={geoJsonData}
              style={getParcelStyle}
              onEachFeature={onEachFeature}
              ref={onGeoJSONLoad}
            />
          )}

        {/* Render clusters if needed based on zoom */}
        {shouldShowClusters &&
          clusterData &&
          clusterData.length > 0 &&
          clusterData.map((cluster, idx) => {
            // Skip invalid clusters
            if (
              !cluster?.center ||
              !Array.isArray(cluster.center) ||
              cluster.center.length < 2
            ) {
              return null;
            }

            // Get count with safe fallback
            const count = cluster.count || 0;

            // Skip rendering very small clusters if there's a large one visible
            const hasLargeCluster = clusterData.some(
              (c) => (c.count || 0) > 1000
            );
            if (hasLargeCluster && count < 5) return null;

            // Calculate radius based on count (logarithmic scale for better visual representation)
            const radius =
              count > 5000
                ? Math.min(60, 30 + Math.log10(count) * 10) // Largest clusters
                : count > 1000
                ? Math.min(50, 20 + Math.log10(count) * 9) // Large clusters
                : count > 100
                ? Math.min(35, 15 + Math.log10(count) * 7) // Medium clusters
                : Math.min(25, 10 + Math.log10(Math.max(count, 10)) * 5); // Small clusters

            // Determine color based on dominant zoning type
            const zoningBreakdown = cluster.zoningBreakdown || {};
            const zoningTypes = Object.entries(zoningBreakdown)
              .filter(([_, typeCount]) => typeCount > 0)
              .sort(([_, a], [__, b]) => b - a);

            const dominantType =
              zoningTypes.length > 0 ? zoningTypes[0][0] : 'Unknown';
            const fillColor =
              ZONING_COLORS[dominantType] || ZONING_COLORS.Unknown;

            // Format count for display (K for thousands)
            const formattedCount =
              count > 999 ? `${(count / 1000).toFixed(1)}K` : count;

            return (
              <CircleMarker
                key={`cluster-${idx}-${count}`}
                center={[cluster.center[1], cluster.center[0]]}
                radius={radius}
                pathOptions={{
                  fillColor: fillColor,
                  color: '#ffffff',
                  weight: 2,
                  opacity: 0.9,
                  fillOpacity: 0.7,
                }}
                eventHandlers={{
                  click: (e) => {
                    // Stop propagation to prevent map click
                    L.DomEvent.stopPropagation(e);
                    if (e.originalEvent) {
                      e.originalEvent.stopPropagation();
                      e.originalEvent.preventDefault();
                    }
                    handleClusterClick(cluster);
                  },
                }}
              >
                <Popup>
                  <div>
                    <strong>{count} parcels</strong>
                    <div className="mt-2">
                      <strong>Zoning breakdown:</strong>
                      <ul className="list-disc pl-4 mt-1">
                        {zoningTypes.map(([type, typeCount]) => (
                          <li key={type} className="text-sm">
                            <span
                              className="inline-block w-3 h-3 rounded-full mr-1"
                              style={{
                                backgroundColor:
                                  ZONING_COLORS[type] || ZONING_COLORS.Unknown,
                              }}
                            ></span>
                            {type}: {typeCount} (
                            {Math.round((typeCount / count) * 100)}%)
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-2 text-center">
                      <em className="text-sm text-gray-500">
                        Double click to zoom in
                      </em>
                    </div>
                  </div>
                </Popup>

                {/* Custom cluster label - more reliable than Tooltip */}
                <DivOverlay
                  center={[cluster.center[1], cluster.center[0]]}
                  html={`<div class="cluster-label">${formattedCount}</div>`}
                />
              </CircleMarker>
            );
          })}

        <MapEventHandler onBoundsChange={handleBoundsChange} />
      </MapContainer>

      <div className="absolute bottom-5 right-5 bg-white bg-opacity-90 p-3 rounded shadow z-[1000]">
        <h4 className="text-sm font-semibold mb-2">Zoning Legend</h4>
        <div className="space-y-1">
          <div className="flex items-center">
            <span
              className="w-4 h-4 rounded inline-block mr-2"
              style={{ backgroundColor: ZONING_COLORS.Residential }}
            ></span>
            <span className="text-xs">Residential</span>
          </div>
          <div className="flex items-center">
            <span
              className="w-4 h-4 rounded inline-block mr-2"
              style={{ backgroundColor: ZONING_COLORS.Commercial }}
            ></span>
            <span className="text-xs">Commercial</span>
          </div>
          <div className="flex items-center">
            <span
              className="w-4 h-4 rounded inline-block mr-2"
              style={{ backgroundColor: ZONING_COLORS.Planned }}
            ></span>
            <span className="text-xs">Planned</span>
          </div>
          <div className="flex items-center">
            <span
              className="w-4 h-4 rounded inline-block mr-2"
              style={{ backgroundColor: ZONING_COLORS.Unknown }}
            ></span>
            <span className="text-xs">Other/Unknown</span>
          </div>
          {shouldShowClusters && (
            <div className="flex items-center">
              <span
                className="w-4 h-4 rounded-full inline-block mr-2"
                style={{
                  backgroundColor: '#4169e1',
                  border: '1px solid white',
                }}
              ></span>
              <span className="text-xs">Parcel Clusters</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ParcelMap;
