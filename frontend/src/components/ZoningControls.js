import React, { useState, useEffect } from 'react';
import apiService from '../services/apiService';

const ZONING_TYPES = ['Residential', 'Commercial', 'Planned'];

// Mapping of zoning types to their available subtypes
const ZONING_SUBTYPES = {
  Residential: ['Single Family', 'Multi Family', 'Two Family'],
  Commercial: ['Office', 'Retail Commercial'],
  Planned: ['Planned Development'],
};

const ZoningControls = ({ selectedParcels, parcelData, onUpdateSuccess }) => {
  const [zoningType, setZoningType] = useState('');
  const [zoningSubType, setZoningSubType] = useState('');
  const [username, setUsername] = useState(
    localStorage.getItem('zoning_username') || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info'); // 'info', 'success', 'error'
  const [selectedParcelDetails, setSelectedParcelDetails] = useState([]);

  // Get zoning sub-types based on selected zoning type
  const getZoningSubTypes = () => {
    return zoningType ? ZONING_SUBTYPES[zoningType] || [] : [];
  };

  // Update selected parcel details when selectedParcels or parcelData changes
  useEffect(() => {
    if (selectedParcels.length > 0 && parcelData && parcelData.features) {
      const details = selectedParcels.map((parcelId) => {
        const feature = parcelData.features.find(
          (f) => f.properties.id === parcelId
        );
        return feature
          ? {
              id: feature.properties.id,
              currentZoningType: feature.properties.zoning_typ || 'Unknown',
              currentZoningSubType: feature.properties.zoning_sub || 'Unknown',
              owner: feature.properties.owner || 'Unknown',
              address: feature.properties.mailadd || 'N/A',
            }
          : {
              id: parcelId,
              currentZoningType: 'Unknown',
              currentZoningSubType: 'Unknown',
            };
      });
      setSelectedParcelDetails(details);
    } else {
      setSelectedParcelDetails([]);
    }
  }, [selectedParcels, parcelData]);

  // Save username to localStorage whenever it changes
  useEffect(() => {
    if (username) {
      localStorage.setItem('zoning_username', username);
    }
  }, [username]);

  // Handle zoning update submission
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate input
    if (selectedParcels.length === 0) {
      setMessage('Please select at least one parcel on the map');
      setMessageType('error');
      return;
    }

    if (!zoningType) {
      setMessage('Please select a zoning type');
      setMessageType('error');
      return;
    }

    if (!zoningSubType) {
      setMessage('Please select a zoning sub-type');
      setMessageType('error');
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage('Updating zoning...');
      setMessageType('info');

      // Capture details of what will be updated for display in confirmation message
      const updateSummary = selectedParcelDetails
        .map(
          (parcel) =>
            `Parcel #${parcel.id}: ${parcel.currentZoningType} → ${zoningType}, ${parcel.currentZoningSubType} → ${zoningSubType}`
        )
        .join('\n');

      // Call API to update zoning
      await apiService.updateZoning(
        selectedParcels,
        zoningType,
        zoningSubType,
        username || 'anonymous'
      );

      // Show success message with details
      setMessage(
        `Successfully updated zoning for ${selectedParcels.length} parcels!\n${updateSummary}`
      );
      setMessageType('success');

      // Reset form
      setZoningType('');
      setZoningSubType('');

      // Notify parent component
      if (onUpdateSuccess) {
        onUpdateSuccess();
      }
    } catch (error) {
      setMessage(`Error updating zoning: ${error.message}`);
      setMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form reset
  const handleReset = () => {
    setZoningType('');
    setZoningSubType('');
    setMessage('');
  };

  // Get appropriate message styling based on type
  const getMessageClasses = () => {
    const baseClasses = 'mt-4 p-3 rounded text-sm whitespace-pre-line';

    switch (messageType) {
      case 'info':
        return `${baseClasses} bg-blue-50 text-blue-800`;
      case 'success':
        return `${baseClasses} bg-green-50 text-green-800`;
      case 'error':
        return `${baseClasses} bg-red-50 text-red-800`;
      default:
        return `${baseClasses} bg-blue-50 text-blue-800`;
    }
  };

  return (
    <div className="card">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">
        Update Zoning
      </h3>

      {selectedParcels.length > 0 ? (
        <div className="mb-4 p-2 bg-blue-50 rounded text-sm text-blue-800">
          <strong>{selectedParcels.length}</strong> parcel(s) selected
          {selectedParcelDetails.length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-100">
              <strong>Selected Parcels:</strong>
              <ul className="mt-1 space-y-1 list-disc list-inside">
                {selectedParcelDetails.map((parcel) => (
                  <li key={parcel.id} className="text-xs">
                    ID: {parcel.id} - Current: {parcel.currentZoningType}/
                    {parcel.currentZoningSubType}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 p-2 bg-amber-50 rounded text-sm text-amber-800">
          No parcels selected. Click on parcels to select them.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="username" className="form-label">
            Your Name (for audit log):
          </label>
          <input
            type="text"
            id="username"
            className="form-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your name"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="zoningType" className="form-label">
            New Zoning Type:
          </label>
          <select
            id="zoningType"
            className="form-input"
            value={zoningType}
            onChange={(e) => {
              setZoningType(e.target.value);
              setZoningSubType(''); // Reset sub-type when type changes
            }}
            disabled={isSubmitting}
          >
            <option value="">Select Zoning Type</option>
            {ZONING_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="zoningSubType" className="form-label">
            New Zoning Sub-Type:
          </label>
          <select
            id="zoningSubType"
            className="form-input"
            value={zoningSubType}
            onChange={(e) => setZoningSubType(e.target.value)}
            disabled={!zoningType || isSubmitting}
          >
            <option value="">Select Sub-Type</option>
            {getZoningSubTypes().map((subType) => (
              <option key={subType} value={subType}>
                {subType}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            type="submit"
            className="btn btn-success"
            disabled={isSubmitting || selectedParcels.length === 0}
          >
            {isSubmitting ? 'Updating...' : 'Update Zoning'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={isSubmitting}
          >
            Reset
          </button>
        </div>

        {message && <div className={getMessageClasses()}>{message}</div>}
      </form>
    </div>
  );
};

export default ZoningControls;
