package com.realestate.zoningupdate.aspect;

import com.realestate.zoningupdate.dto.ZoningUpdateRequest;
import com.realestate.zoningupdate.model.Parcel;
import com.realestate.zoningupdate.repository.ParcelRepository;
import com.realestate.zoningupdate.service.AuditService;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.AfterThrowing;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Aspect
@Component
@Slf4j
public class AuditAspect {

    @Autowired
    private AuditService auditService;

    @Autowired
    private ParcelRepository parcelRepository;

    @Before("execution(* com.realestate.zoningupdate.controller.ParcelController.updateZoning(..))")
    public void beforeZoningUpdate(JoinPoint joinPoint) {
        Object[] args = joinPoint.getArgs();
        if (args.length > 0 && args[0] instanceof ZoningUpdateRequest) {
            ZoningUpdateRequest request = (ZoningUpdateRequest) args[0];

            // Add null checks to prevent NPE
            int parcelCount = (request.getParcelIds() != null) ? request.getParcelIds().size() : 0;

            // Get details about the parcels being updated
            StringBuilder detailsBuilder = new StringBuilder();
            detailsBuilder.append("Request to update ").append(parcelCount).append(" parcels:\n");

            if (request.getParcelIds() != null && !request.getParcelIds().isEmpty()) {
                try {
                    // Fetch current zoning information for all parcels
                    List<Parcel> parcels = parcelRepository.findAllById(request.getParcelIds());
                    Map<Integer, Parcel> parcelMap = parcels.stream()
                            .collect(Collectors.toMap(Parcel::getId, p -> p));

                    for (Integer parcelId : request.getParcelIds()) {
                        Parcel parcel = parcelMap.get(parcelId);
                        if (parcel != null) {
                            detailsBuilder.append("Parcel ID: ").append(parcelId)
                                    .append(", Current: [")
                                    .append(parcel.getZoning_typ() != null ? parcel.getZoning_typ() : "Unknown")
                                    .append(" - ")
                                    .append(parcel.getZoning_sub() != null ? parcel.getZoning_sub() : "Unknown")
                                    .append("], Requested: [")
                                    .append(request.getZoningType() != null ? request.getZoningType() : "Unknown")
                                    .append(" - ")
                                    .append(request.getZoningSubType() != null ? request.getZoningSubType() : "Unknown")
                                    .append("]\n");
                        } else {
                            detailsBuilder.append("Parcel ID: ").append(parcelId)
                                    .append(" (not found), Requested: [")
                                    .append(request.getZoningType() != null ? request.getZoningType() : "Unknown")
                                    .append(" - ")
                                    .append(request.getZoningSubType() != null ? request.getZoningSubType() : "Unknown")
                                    .append("]\n");
                        }
                    }
                } catch (Exception e) {
                    log.warn("Could not fetch detailed parcel information for audit log", e);
                    // Fallback to basic information if we can't get detailed info
                    detailsBuilder = new StringBuilder();
                    detailsBuilder.append("Request to update ").append(parcelCount)
                            .append(" parcels to zoning type: ")
                            .append(request.getZoningType() != null ? request.getZoningType() : "Unknown")
                            .append(", sub-type: ")
                            .append(request.getZoningSubType() != null ? request.getZoningSubType() : "Unknown");
                }
            }

            // Provide default username if null
            String username = (request.getUsername() != null) ? request.getUsername() : "anonymous";
            auditService.logAuditEvent("ZONING_UPDATE_REQUEST", detailsBuilder.toString(), username);
        }
    }

    @AfterReturning("execution(* com.realestate.zoningupdate.service.ParcelService.updateZoning(..))")
    public void afterZoningUpdateSuccess(JoinPoint joinPoint) {
        Object[] args = joinPoint.getArgs();
        if (args.length > 0 && args[0] instanceof ZoningUpdateRequest) {
            ZoningUpdateRequest request = (ZoningUpdateRequest) args[0];

            // Add null checks
            int parcelCount = (request.getParcelIds() != null) ? request.getParcelIds().size() : 0;

            String details = String.format(
                    "Successfully completed zoning update for %d parcels to type '%s', sub-type '%s'",
                    parcelCount,
                    request.getZoningType() != null ? request.getZoningType() : "Unknown",
                    request.getZoningSubType() != null ? request.getZoningSubType() : "Unknown"
            );

            // Add parcel IDs for reference
            if (request.getParcelIds() != null && !request.getParcelIds().isEmpty()) {
                details += ". Parcels updated: " + request.getParcelIds();
            }

            // Provide default username if null
            String username = (request.getUsername() != null) ? request.getUsername() : "anonymous";
            auditService.logAuditEvent("ZONING_UPDATE_SUCCESS", details, username);
        }
    }

    @AfterThrowing(
            pointcut = "execution(* com.realestate.zoningupdate.service.ParcelService.updateZoning(..))",
            throwing = "exception"
    )
    public void afterZoningUpdateFailure(JoinPoint joinPoint, Exception exception) {
        Object[] args = joinPoint.getArgs();
        if (args.length > 0 && args[0] instanceof ZoningUpdateRequest) {
            ZoningUpdateRequest request = (ZoningUpdateRequest) args[0];

            // Add null checks
            int parcelCount = (request.getParcelIds() != null) ? request.getParcelIds().size() : 0;

            StringBuilder detailsBuilder = new StringBuilder();
            detailsBuilder.append("Failed to update zoning for ").append(parcelCount).append(" parcels. Error: ")
                    .append(exception.getMessage() != null ? exception.getMessage() : "Unknown error")
                    .append(". Attempted to update to type '")
                    .append(request.getZoningType() != null ? request.getZoningType() : "Unknown")
                    .append("', sub-type '")
                    .append(request.getZoningSubType() != null ? request.getZoningSubType() : "Unknown")
                    .append("'");

            // Add parcel IDs for reference
            if (request.getParcelIds() != null && !request.getParcelIds().isEmpty()) {
                detailsBuilder.append(". Parcels: ").append(request.getParcelIds());
            }

            // Provide default username if null
            String username = (request.getUsername() != null) ? request.getUsername() : "anonymous";
            auditService.logAuditEvent("ZONING_UPDATE_FAILURE", detailsBuilder.toString(), username);
        }
    }
}