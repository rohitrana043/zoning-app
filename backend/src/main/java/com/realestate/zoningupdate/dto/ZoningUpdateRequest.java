package com.realestate.zoningupdate.dto;

import lombok.Data;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

@Data
public class ZoningUpdateRequest {

    @NotNull(message = "Parcel IDs list cannot be null")
    @NotEmpty(message = "At least one parcel ID must be specified")
    private List<Integer> parcelIds;

    @NotNull(message = "Zoning type cannot be null")
    @Size(min = 1, max = 50, message = "Zoning type must be between 1 and 50 characters")
    private String zoningType;

    @NotNull(message = "Zoning sub-type cannot be null")
    @Size(min = 1, max = 50, message = "Zoning sub-type must be between 1 and 50 characters")
    private String zoningSubType;

    private String username;
}
