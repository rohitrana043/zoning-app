import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ParcelMap from './components/Map';
import ZoningControls from './components/ZoningControls';
import Statistics from './components/Statistics';
import MockDataToggle from './components/MockDataToggle';
import AuditLogViewer from './components/AuditLogViewer';
import apiService from './services/apiService';

function App() {
  const [selectedParcels, setSelectedParcels] = useState([]);
  const [visibleParcelData, setVisibleParcelData] = useState(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  // Fetch global statistics only
  const [globalStats, setGlobalStats] = useState({});
  // Added flag to track if stats are loading to prevent duplicate requests
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      // Prevent multiple simultaneous requests
      if (isLoadingStats) return;

      try {
        setIsLoadingStats(true);
        const data = await apiService.getZoningStatistics();
        setGlobalStats(data);
      } catch (error) {
        console.error('Error fetching statistics:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchStats();
  }, [dataRefreshKey]);

  // Handle parcel selection/deselection
  const handleParcelSelect = useCallback((parcelId) => {
    setSelectedParcels((prevSelected) => {
      if (prevSelected.includes(parcelId)) {
        // Deselect if already selected
        return prevSelected.filter((id) => id !== parcelId);
      } else {
        // Add to selection
        return [...prevSelected, parcelId];
      }
    });
  }, []);

  // Handler for map visible data changes - memoized properly
  const handleVisibleDataChange = useCallback((data) => {
    if (data && data.features) {
      setVisibleParcelData(data);
    }
  }, []);

  // Handle successful update
  const handleUpdateSuccess = useCallback(() => {
    // Clear the selected parcels
    setSelectedParcels([]);

    // Refresh data after a short delay to let the backend process
    setTimeout(() => {
      setDataRefreshKey((prev) => prev + 1);
    }, 1000);
  }, []);

  // Handle mock data reset
  const handleMockDataReset = useCallback(() => {
    setSelectedParcels([]);
    setDataRefreshKey((prev) => prev + 1);
  }, []);

  // Toggle audit logs view
  const toggleAuditLogs = useCallback(() => {
    setShowAuditLogs((prev) => !prev);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">
              Real Estate Zoning Update Tool
            </h1>
            <h2 className="text-lg text-gray-500 mt-1">
              Manage zoning updates for real estate parcels
            </h2>
          </div>
          <button onClick={toggleAuditLogs} className="btn btn-primary">
            {showAuditLogs ? 'Hide Audit Logs' : 'View Audit Logs'}
          </button>
        </div>
      </header>

      {/* Mock Data Toggle */}
      <MockDataToggle onReset={handleMockDataReset} />

      {showAuditLogs ? (
        <AuditLogViewer />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            {/* Map component */}
            <ParcelMap
              selectedParcels={selectedParcels}
              onParcelSelect={handleParcelSelect}
              onVisibleDataChange={handleVisibleDataChange}
              key={`map-${dataRefreshKey}`}
            />

            {/* Statistics component */}
            <Statistics
              selectedParcels={selectedParcels}
              globalStats={globalStats}
              visibleParcelData={visibleParcelData}
              key={`stats-${dataRefreshKey}`}
            />
          </div>

          <div className="lg:col-span-1">
            {/* Zoning controls component */}
            <ZoningControls
              selectedParcels={selectedParcels}
              parcelData={visibleParcelData}
              onUpdateSuccess={handleUpdateSuccess}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
