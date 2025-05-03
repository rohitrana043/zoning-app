package com.realestate.zoningupdate.exception;

import lombok.Data;

import java.util.Date;
import java.util.Map;

/**
 * Extended error response for validation errors
 * Includes a map of field-specific error messages
 */
@Data
public class ValidationErrorResponse extends ErrorResponse {
    private Map<String, String> fieldErrors;

    public ValidationErrorResponse(Date timestamp, int status, String error,
                                   String message, String path,
                                   Map<String, String> fieldErrors) {
        super(timestamp, status, error, message, path);
        this.fieldErrors = fieldErrors;
    }
}
