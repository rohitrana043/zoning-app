import React, { useState, useEffect } from 'react';
import apiService from '../services/apiService';

const AuditLogViewer = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState({});
  const [filter, setFilter] = useState('all');

  // Fetch audit logs
  useEffect(() => {
    const fetchAuditLogs = async () => {
      try {
        setLoading(true);
        setError(null);
        const logs = await apiService.getAuditLogs();

        // Check if logs are valid
        if (!Array.isArray(logs)) {
          throw new Error('Invalid response format: expected an array of logs');
        }

        // Process logs to ensure consistent format
        const processedLogs = logs.map((log) => ({
          timestamp: parseTimestamp(log.timestamp),
          action: log.action || 'UNKNOWN',
          details: log.details || 'No details available',
          username: log.username || 'anonymous',
        }));

        // Sort logs by timestamp in descending order (most recent first)
        const sortedLogs = processedLogs.sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );

        setAuditLogs(sortedLogs);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching audit logs:', error);
        setError(`Failed to load audit logs: ${error.message}`);
        setLoading(false);
      }
    };

    fetchAuditLogs();
  }, []);

  // Helper function to parse various timestamp formats
  const parseTimestamp = (timestamp) => {
    if (!timestamp) return new Date().toISOString();

    try {
      // Handle string timestamp
      if (typeof timestamp === 'string') {
        return new Date(timestamp).toISOString();
      }

      // Handle array timestamp [year, month, day, hour, minute, second]
      if (Array.isArray(timestamp) && timestamp.length >= 6) {
        return new Date(
          timestamp[0],
          timestamp[1] - 1, // JavaScript months are 0-indexed
          timestamp[2],
          timestamp[3],
          timestamp[4],
          timestamp[5]
        ).toISOString();
      }

      // Handle date object
      if (timestamp instanceof Date) {
        return timestamp.toISOString();
      }

      // Default fallback
      return new Date().toISOString();
    } catch (e) {
      console.error('Error parsing timestamp:', e, timestamp);
      return new Date().toISOString();
    }
  };

  // Toggle expanded state for a log entry
  const toggleExpand = (index) => {
    setExpandedLogs((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (e) {
      console.error('Error formatting timestamp:', e, timestamp);
      return 'Invalid date';
    }
  };

  // Get action color based on type
  const getActionColor = (action) => {
    switch (action) {
      case 'ZONING_UPDATE_REQUEST':
        return 'bg-blue-100 text-blue-800';
      case 'ZONING_UPDATE_SUCCESS':
        return 'bg-green-100 text-green-800';
      case 'ZONING_UPDATE_FAILURE':
        return 'bg-red-100 text-red-800';
      case 'ZONING_UPDATE':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format detailed log view
  const formatDetailedLog = (details) => {
    if (!details) return <p>No details available</p>;

    // Check if details contains newlines (indicating multi-line formatted details)
    if (details.includes('\n')) {
      return (
        <div className="whitespace-pre-wrap text-sm font-mono">{details}</div>
      );
    }

    // Handle standard details formatting
    return <p className="text-sm">{details}</p>;
  };

  // Format additional information about parcels
  const formatParcelInfo = (details) => {
    // This function could extract and format parcel IDs and other structured data
    // For now, we'll use the formatDetailedLog function which handles both formats
    return formatDetailedLog(details);
  };

  // Filter logs
  const filteredLogs = auditLogs.filter((log) => {
    if (filter === 'all') return true;
    return log.action && log.action.includes(filter);
  });

  // Handle retry
  const handleRetry = () => {
    setLoading(true);
    setError(null);
    // Re-trigger the useEffect by updating a state that the useEffect depends on
    setFilter((prev) => (prev === 'all' ? 'all_refresh' : 'all'));
  };

  // Render content based on loading/error state
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
        <p className="mb-4">{error}</p>
        <button
          onClick={handleRetry}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Audit Logs</h2>

        {/* Filter dropdown */}
        <div className="flex items-center space-x-2">
          <label htmlFor="log-filter" className="text-sm text-gray-600">
            Filter:
          </label>
          <select
            id="log-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="form-input text-sm p-1"
          >
            <option value="all">All Logs</option>
            <option value="ZONING_UPDATE_REQUEST">Requests</option>
            <option value="ZONING_UPDATE">Updates</option>
            <option value="ZONING_UPDATE_SUCCESS">Successful Updates</option>
            <option value="ZONING_UPDATE_FAILURE">Failed Updates</option>
          </select>
        </div>
      </div>

      {/* No logs message */}
      {filteredLogs.length === 0 && (
        <div className="text-center text-gray-500 p-6">
          No audit logs found.
        </div>
      )}

      {/* Logs list */}
      <div className="divide-y divide-gray-200">
        {filteredLogs.map((log, index) => (
          <div
            key={index}
            className="p-4 hover:bg-gray-50 transition-colors duration-200"
          >
            <div
              className="flex justify-between items-center cursor-pointer"
              onClick={() => toggleExpand(index)}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(
                    log.action
                  )}`}
                >
                  {log.action}
                </span>
                <span className="text-sm text-gray-600">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className="text-sm text-gray-500">
                  by {log.username || 'Unknown User'}
                </span>
              </div>

              <button className="text-gray-500 hover:text-gray-800">
                {expandedLogs[index] ? '▼' : '▶'}
              </button>
            </div>

            {/* Expanded log details */}
            {expandedLogs[index] && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">Details:</h4>
                {formatParcelInfo(log.details)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination or load more could be added here in future */}
      <div className="bg-gray-50 p-4 text-center text-sm text-gray-500">
        Showing {filteredLogs.length} of {auditLogs.length} logs
      </div>
    </div>
  );
};

export default AuditLogViewer;
