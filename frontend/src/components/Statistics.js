import React, { useState, useEffect } from 'react';

const Statistics = ({ selectedParcels, globalStats, visibleParcelData }) => {
  const [visibleAreaStats, setVisibleAreaStats] = useState({});
  const [loading, setLoading] = useState(false); // Changed to false by default
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('visible');

  // Calculate visible area statistics from visibleParcelData
  useEffect(() => {
    if (visibleParcelData && visibleParcelData.features) {
      try {
        const stats = {};

        // Calculate stats based on visible features
        visibleParcelData.features.forEach((feature) => {
          const zoningType = feature.properties.zoning_typ || 'Unknown';
          stats[zoningType] = (stats[zoningType] || 0) + 1;
        });

        setVisibleAreaStats(stats);
      } catch (error) {
        console.error('Error calculating visible area statistics:', error);
      }
    }
  }, [visibleParcelData]);

  // Calculate statistics for selected parcels
  const calculateSelectedStats = () => {
    if (
      !visibleParcelData ||
      !visibleParcelData.features ||
      selectedParcels.length === 0
    ) {
      return null;
    }

    // Filter features for selected parcels
    const selectedFeatures = visibleParcelData.features.filter((feature) =>
      selectedParcels.includes(feature.properties.id)
    );

    // Count parcels by zoning type
    const zoningCounts = {};
    selectedFeatures.forEach((feature) => {
      const zoningType = feature.properties.zoning_typ || 'Unknown';
      zoningCounts[zoningType] = (zoningCounts[zoningType] || 0) + 1;
    });

    return zoningCounts;
  };

  // Get the selected statistics
  const selectedStats = calculateSelectedStats();

  // Calculate total parcels for each dataset
  const globalTotal = Object.values(globalStats || {}).reduce(
    (sum, val) => sum + val,
    0
  );

  const visibleTotal = visibleParcelData
    ? visibleParcelData.features.length
    : 0;

  if (loading) {
    return (
      <div className="card flex items-center justify-center h-48">
        <div className="text-gray-500">Loading statistics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card flex flex-col items-center justify-center h-48">
        <p className="text-red-600 mb-4">{error}</p>
      </div>
    );
  }

  // Calculate percentage of specific type
  const calculatePercentage = (count, total) => {
    if (total === 0) return '0.0';
    return ((count / total) * 100).toFixed(1);
  };

  const renderStatsList = (stats, total) => {
    if (!stats || Object.keys(stats).length === 0) {
      return (
        <p className="text-gray-500 text-sm">No zoning statistics available</p>
      );
    }

    return (
      <ul className="space-y-2">
        {Object.entries(stats).map(([type, count]) => (
          <li key={type} className="flex items-center text-sm">
            <span className="flex-1 font-medium">{type || 'Unknown'}:</span>
            <span className="font-semibold mr-2">{count} parcels</span>
            <span className="text-gray-500 text-xs">
              ({calculatePercentage(count, total)}%)
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="card">
      <div className="flex items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-800">
          Zoning Statistics
        </h3>
        {process.env.REACT_APP_MOCK_DATA === 'true' && (
          <span className="ml-2 bg-orange-500 text-white text-xs px-2 py-0.5 rounded">
            Mock
          </span>
        )}
      </div>

      {/* Tabs for switching between global and visible stats - Order swapped */}
      <div className="flex border-b mb-4">
        <button
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === 'visible'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('visible')}
        >
          Map View ({visibleTotal})
        </button>
        <button
          className={`py-2 px-4 font-medium text-sm ${
            activeTab === 'global'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
          onClick={() => setActiveTab('global')}
        >
          All Parcels ({globalTotal})
        </button>
      </div>

      {/* Stats content based on active tab */}
      <div className="mb-6">
        {activeTab === 'global' && (
          <>
            <h4 className="text-sm font-medium text-gray-700 border-b pb-2 mb-3">
              Overall Zoning Distribution (All Parcels)
            </h4>
            {renderStatsList(globalStats, globalTotal)}
          </>
        )}

        {activeTab === 'visible' && (
          <>
            <h4 className="text-sm font-medium text-gray-700 border-b pb-2 mb-3">
              Zoning Distribution (Current Map View)
            </h4>
            {renderStatsList(visibleAreaStats, visibleTotal)}
            <p className="text-xs text-gray-500 mt-2 italic">
              * Statistics calculated from parcels loaded in current map view
            </p>
          </>
        )}
      </div>

      {selectedParcels.length > 0 && selectedStats && (
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-700 border-b pb-2 mb-3">
            Selected Parcels ({selectedParcels.length})
          </h4>
          {renderStatsList(selectedStats, selectedParcels.length)}
        </div>
      )}

      {selectedParcels.length > 0 && (
        <div className="pt-4 border-t border-gray-200">
          <p className="text-sm">
            <span className="font-medium">Total Selected:</span>{' '}
            {selectedParcels.length} parcels
          </p>
        </div>
      )}
    </div>
  );
};

export default Statistics;
