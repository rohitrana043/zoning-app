import React from 'react';
import { resetMockData } from '../utils/mockDataHandler';

const MockDataToggle = ({ onReset }) => {
  // Only show this component if mock data mode is enabled
  if (process.env.REACT_APP_MOCK_DATA !== 'true') {
    return null;
  }

  const handleResetMockData = () => {
    resetMockData();
    if (onReset) {
      onReset();
    }
  };

  return (
    <div className="bg-amber-50 border border-dashed border-amber-500 rounded-lg p-4 mb-6 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="bg-amber-500 text-white text-xs font-bold px-2 py-1 rounded self-start">
          MOCK MODE
        </span>
        <p className="text-gray-800 text-sm">
          Running in mock data mode. All changes are stored in browser
          localStorage and will persist between page refreshes.
        </p>
      </div>
      <button
        className="btn btn-warning self-start"
        onClick={handleResetMockData}
      >
        Reset Mock Data
      </button>
    </div>
  );
};

export default MockDataToggle;
