package com.realestate.zoningupdate.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.realestate.zoningupdate.dto.ClusterDTO;
import com.realestate.zoningupdate.dto.ParcelDTO;
import com.realestate.zoningupdate.dto.ZoningUpdateRequest;
import com.realestate.zoningupdate.exception.DatabasePermissionException;
import com.realestate.zoningupdate.exception.ResourceNotFoundException;
import com.realestate.zoningupdate.exception.ZoningUpdateException;
import com.realestate.zoningupdate.model.Parcel;
import com.realestate.zoningupdate.repository.ParcelRepository;
import com.realestate.zoningupdate.util.GeoJSONConverter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.hibernate.exception.JDBCConnectionException;
import org.postgresql.util.PGobject;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PermissionDeniedDataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.SQLException;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ParcelService {

    private final ParcelRepository parcelRepository;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    /**
     * Get all parcels as DTOs
     *
     * @return List of ParcelDTO objects
     * @throws DataAccessException if a database access error occurs
     */
    public List<ParcelDTO> getAllParcels() {
        try {
            List<Parcel> parcels = parcelRepository.findAll();
            return parcels.stream()
                    .map(GeoJSONConverter::convertToDTO)
                    .collect(Collectors.toList());
        } catch (JDBCConnectionException e) {
            log.error("Database connection error while fetching parcels", e);
            throw new DatabasePermissionException("Unable to connect to the database", e);
        } catch (DataAccessException e) {
            log.error("Error accessing database while fetching parcels", e);
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error while fetching parcels", e);
            throw new RuntimeException("An unexpected error occurred while fetching parcels", e);
        }
    }

    /**
     * Get all parcels as GeoJSON format
     *
     * @return GeoJSON representation of all parcels
     * @throws DataAccessException if a database access error occurs
     */
    public Map<String, Object> getAllParcelsGeoJSON() {
        try {
            List<Parcel> parcels = parcelRepository.findAll();
            return GeoJSONConverter.convertToGeoJSON(parcels);
        } catch (JDBCConnectionException e) {
            log.error("Database connection error while fetching parcels as GeoJSON", e);
            throw new DatabasePermissionException("Unable to connect to the database", e);
        } catch (DataAccessException e) {
            log.error("Error accessing database while fetching parcels as GeoJSON", e);
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error while fetching parcels as GeoJSON", e);
            throw new RuntimeException("An unexpected error occurred while fetching parcels as GeoJSON", e);
        }
    }

    /**
     * Get parcels within specified geographic bounds
     *
     * @param north Northern latitude bound
     * @param south Southern latitude bound
     * @param east Eastern longitude bound
     * @param west Western longitude bound
     * @return GeoJSON representation of parcels within bounds
     */
    public Map<String, Object> getParcelsByBounds(double north, double south, double east, double west) {
        List<Parcel> parcels = parcelRepository.findByBounds(west, south, east, north);
        log.info("Found {} parcels within the requested bounds", parcels.size());
        return GeoJSONConverter.convertToGeoJSON(parcels);
    }

    private double calculateGridSize(int zoom) {
        // Simple grid size calculation
        return 0.001 * Math.pow(2, 16 - zoom);
    }

    /**
     * Get clusters of parcels within specified geographic bounds.
     * This method aggregates parcels into clusters for efficient map rendering
     * at lower zoom levels.
     *
     * @param north Northern latitude bound
     * @param south Southern latitude bound
     * @param east Eastern longitude bound
     * @param west Western longitude bound
     * @param zoom Current map zoom level (used to determine clustering granularity)
     * @return List of cluster DTOs
     */
    @Cacheable(value = "clusterCache", key = "{#north, #south, #east, #west, #zoom}")
    public List<ClusterDTO> getParcelClusters(double north, double south, double east, double west, int zoom) {
        try {
            log.info("Fetching parcel clusters for bounds: N:{}, S:{}, E:{}, W:{}, zoom:{}",
                    north, south, east, west, zoom);

            // Calculate grid size based on zoom
            double gridSize = calculateGridSize(zoom);

            // Execute clustering query
            List<Object[]> results = parcelRepository.findClusters(west, south, east, north, gridSize);

            List<ClusterDTO> clusters = new ArrayList<>();

            // If no clusters returned from query, create a single fallback cluster
            if (results == null || results.isEmpty()) {
                log.info("No clusters found from query, checking for parcels in bounds");
                List<Parcel> parcelsInBounds = parcelRepository.findByBounds(west, south, east, north);

                // Only create fallback cluster if we have at least 10 parcels
                if (parcelsInBounds.size() >= 10) {
                    log.info("Creating fallback cluster with {} parcels", parcelsInBounds.size());
                    // Create a fallback cluster with all parcels in bounds
                    Map<String, Integer> zoningBreakdown = new HashMap<>();

                    for (Parcel parcel : parcelsInBounds) {
                        String zoningType = parcel.getZoning_typ() != null ?
                                parcel.getZoning_typ() : "Unknown";
                        zoningBreakdown.put(zoningType,
                                zoningBreakdown.getOrDefault(zoningType, 0) + 1);
                    }

                    // Calculate center point from bounds
                    double centerX = (east + west) / 2;
                    double centerY = (north + south) / 2;

                    // Create and add the fallback cluster
                    ClusterDTO fallbackCluster = new ClusterDTO(
                            new double[]{centerX, centerY},
                            parcelsInBounds.size(),
                            zoningBreakdown,
                            new double[]{west, south, east, north}
                    );

                    clusters.add(fallbackCluster);
                } else {
                    log.info("Not enough parcels ({}) for minimum cluster size threshold",
                            parcelsInBounds.size());
                }
                return clusters;
            }

            // Process results from query
            for (Object[] result : results) {
                try {
                    // Skip null results
                    if (result == null || result.length < 4 || result[0] == null) {
                        continue;
                    }

                    // Parse the cluster information from the query result
                    Double[] centerArray = (Double[]) result[0]; // or use PGobject and cast
                    double[] center = Arrays.stream(centerArray).mapToDouble(Double::doubleValue).toArray();
                    int count = ((Number) result[1]).intValue();

                    // Skip clusters with less than 10 parcels (double check)
                    if (count < 10) {
                        continue;
                    }

                    // Parse the zoning breakdown JSON
                    String jsonStr = result[2].toString();  // safe toString() for jsonb

                    Map<String, Integer> zoningBreakdown = parseZoningBreakdown(jsonStr);

                    // Get the bounds
                    Double[] boundsArray = (Double[]) result[3];
                    double[] bounds = Arrays.stream(boundsArray).mapToDouble(Double::doubleValue).toArray();

                    // Create and add the cluster DTO
                    ClusterDTO cluster = new ClusterDTO(center, count, zoningBreakdown, bounds);
                    clusters.add(cluster);
                } catch (Exception e) {
                    log.error("Error processing cluster row: {}", e.getMessage());
                    // Continue processing other rows
                }
            }

            log.info("Returning {} clusters", clusters.size());
            return clusters;
        } catch (Exception e) {
            log.error("Error fetching parcel clusters", e);
            // Return empty list on error to allow frontend to fall back
            return new ArrayList<>();
        }
    }

    /**
     * Helper method to parse zoning breakdown from PostgreSQL JSONB object
     */
    @SuppressWarnings("unchecked")
    private Map<String, Integer> parseZoningBreakdown(Object jsonbObj) {
        try {
            if (jsonbObj instanceof PGobject) {
                PGobject pgObj = (PGobject) jsonbObj;
                if ("jsonb".equals(pgObj.getType())) {
                    return objectMapper.readValue(pgObj.getValue(), Map.class);
                }
            } else if (jsonbObj instanceof String) {
                return objectMapper.readValue((String) jsonbObj, Map.class);
            } else if (jsonbObj instanceof Map) {
                return (Map<String, Integer>) jsonbObj;
            }
        } catch (JsonProcessingException e) {
            log.error("Error parsing zoning breakdown from JSONB", e);
        }
        return new HashMap<>();
    }


    /**
     * Update zoning information for a list of parcels
     *
     * This method executes within a transaction to ensure that both
     * the database update and the audit log entry are created atomically.
     * If either operation fails, the entire transaction will be rolled back.
     *
     * @param request Contains parcel IDs and new zoning information
     * @throws ZoningUpdateException if the update fails
     * @throws ResourceNotFoundException if a parcel is not found
     * @throws DatabasePermissionException if there's a permission issue
     */
    @Transactional(isolation = Isolation.READ_COMMITTED, rollbackFor = Exception.class)
    public void updateZoning(ZoningUpdateRequest request) {
        // Validate request
        if (request.getParcelIds() == null || request.getParcelIds().isEmpty()) {
            log.warn("Attempted to update zoning with empty parcel list");
            throw new ZoningUpdateException("Parcel IDs list cannot be empty");
        }

        if (request.getZoningType() == null || request.getZoningType().trim().isEmpty()) {
            throw new ZoningUpdateException("Zoning type cannot be empty");
        }

        if (request.getZoningSubType() == null || request.getZoningSubType().trim().isEmpty()) {
            throw new ZoningUpdateException("Zoning sub-type cannot be empty");
        }

        log.info("Updating zoning for {} parcels: {}",
                request.getParcelIds().size(),
                request.getParcelIds());

        try {
            // Fetch existing parcels to get their previous zoning info before updating
            List<Parcel> existingParcels = parcelRepository.findAllById(request.getParcelIds());

            // Create a map of previous zoning info for audit purposes
            Map<Integer, Map<String, String>> previousZoningInfo = new HashMap<>();
            for (Parcel parcel : existingParcels) {
                Map<String, String> zoningInfo = new HashMap<>();
                zoningInfo.put("type", parcel.getZoning_typ());
                zoningInfo.put("subType", parcel.getZoning_sub());
                previousZoningInfo.put(parcel.getId(), zoningInfo);
            }

            // Update zoning for all parcels in a single transaction
            int updatedCount = parcelRepository.updateZoningForParcels(
                    request.getParcelIds(),
                    request.getZoningType(),
                    request.getZoningSubType()
            );

            log.info("Successfully updated zoning for {} parcels", updatedCount);

            if (updatedCount == 0) {
                throw new ResourceNotFoundException("None of the specified parcels were found");
            }

            if (updatedCount != request.getParcelIds().size()) {
                log.warn("Requested to update {} parcels but only {} were updated",
                        request.getParcelIds().size(), updatedCount);

                throw new ZoningUpdateException(String.format(
                        "Partial update: requested to update %d parcels but only %d were found",
                        request.getParcelIds().size(), updatedCount));
            }
        } catch (PermissionDeniedDataAccessException e) {
            log.error("Permission denied to update zoning data", e);
            throw new DatabasePermissionException("Permission denied for updating zoning. Contact your administrator for access.", e);
        } catch (DataIntegrityViolationException e) {
            log.error("Data integrity violation updating zoning", e);
            throw new ZoningUpdateException("Data integrity error. Check that your input is valid.", e);
        } catch (DataAccessException e) {
            // Check if the underlying cause is a permission issue
            if (e.getCause() instanceof SQLException) {
                SQLException sqlEx = (SQLException) e.getCause();
                // PostgreSQL permission denied error code is 42501
                if (sqlEx.getSQLState() != null && sqlEx.getSQLState().equals("42501")) {
                    log.error("SQL Permission denied to update zoning data: {}", sqlEx.getMessage());
                    throw new DatabasePermissionException("Permission denied for updating zoning. Contact your administrator for access.", e);
                }
            }

            log.error("Data access error updating zoning: {}", e.getMessage(), e);
            throw new ZoningUpdateException("Database error occurred while updating zoning", e);
        } catch (ResourceNotFoundException | ZoningUpdateException | DatabasePermissionException e) {
            // Let these custom exceptions pass through as they're already appropriately typed
            throw e;
        } catch (Exception e) {
            log.error("Failed to update zoning for parcels: {}", request.getParcelIds(), e);
            throw new ZoningUpdateException("Failed to update zoning", e);
        }
    }

    /**
     * Get statistics about zoning types
     *
     * @return Map of zoning type to count
     * @throws DataAccessException if a database access error occurs
     */
    public Map<String, Long> getZoningTypeStatistics() {
        try {
            List<Object[]> results = parcelRepository.countParcelsByZoningType();

            Map<String, Long> statistics = results.stream()
                    .collect(Collectors.toMap(
                            row -> (row[0] != null) ? (String) row[0] : "Unknown",
                            row -> (Long) row[1],
                            (a, b) -> a
                    ));

            return statistics;
        } catch (JDBCConnectionException e) {
            log.error("Database connection error while fetching zoning statistics", e);
            throw new DatabasePermissionException("Unable to connect to the database", e);
        } catch (DataAccessException e) {
            log.error("Error accessing database while fetching zoning statistics", e);
            throw e;
        } catch (Exception e) {
            log.error("Unexpected error while fetching zoning statistics", e);
            throw new RuntimeException("An unexpected error occurred while fetching zoning statistics", e);
        }
    }
}
