package com.realestate.zoningupdate.controller;

import com.realestate.zoningupdate.dto.ClusterDTO;
import com.realestate.zoningupdate.dto.ParcelDTO;
import com.realestate.zoningupdate.dto.ZoningUpdateRequest;
import com.realestate.zoningupdate.exception.ErrorResponse;
import com.realestate.zoningupdate.service.ParcelService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/parcels")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
@Slf4j
public class ParcelController {

    private final ParcelService parcelService;

    @GetMapping
    public ResponseEntity<List<ParcelDTO>> getAllParcels() {
        log.info("Fetching all parcels");
        return ResponseEntity.ok(parcelService.getAllParcels());
    }

    @GetMapping("/geojson")
    public ResponseEntity<Map<String, Object>> getAllParcelsGeoJSON() {
        log.info("Fetching all parcels as GeoJSON");
        return ResponseEntity.ok(parcelService.getAllParcelsGeoJSON());
    }

    @GetMapping("/geojson/bounds")
    public ResponseEntity<Map<String, Object>> getParcelsByBounds(
            @RequestParam double north,
            @RequestParam double south,
            @RequestParam double east,
            @RequestParam double west) {
        log.info("Fetching parcels within bounds: N:{}, S:{}, E:{}, W:{}", north, south, east, west);
        return ResponseEntity.ok(parcelService.getParcelsByBounds(north, south, east, west));
    }

    /**
     * Get clusters of parcels within specified bounds for efficient map rendering.
     * This endpoint is used for lower zoom levels where individual parcels would be too small
     * or too numerous to render effectively.
     *
     * @param north Northern latitude bound
     * @param south Southern latitude bound
     * @param east Eastern longitude bound
     * @param west Western longitude bound
     * @param zoom Current map zoom level (used to determine clustering granularity)
     * @return List of cluster DTOs with center points and counts
     */
    @GetMapping("/clusters")
    public ResponseEntity<List<ClusterDTO>> getParcelClusters(
            @RequestParam double north,
            @RequestParam double south,
            @RequestParam double east,
            @RequestParam double west,
            @RequestParam int zoom) {
        log.info("Fetching parcel clusters for bounds: N:{}, S:{}, E:{}, W:{}, zoom:{}",
                north, south, east, west, zoom);
        return ResponseEntity.ok(parcelService.getParcelClusters(north, south, east, west, zoom));
    }

    @PostMapping("/update-zoning")
    public ResponseEntity<?> updateZoning(@Valid @RequestBody ZoningUpdateRequest request) {
        log.info("Received zoning update request for {} parcels", request.getParcelIds().size());

        // Set default username if not provided
        if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
            request.setUsername("anonymous");
        }

        parcelService.updateZoning(request);

        Map<String, Object> response = Map.of(
                "success", true,
                "message", "Zoning updated successfully",
                "updatedParcels", request.getParcelIds().size()
        );

        return ResponseEntity.ok(response);
    }

    @GetMapping("/statistics")
    public ResponseEntity<Map<String, Long>> getZoningStatistics() {
        log.info("Fetching zoning type statistics");
        return ResponseEntity.ok(parcelService.getZoningTypeStatistics());
    }
}
