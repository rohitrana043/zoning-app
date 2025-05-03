package com.realestate.zoningupdate.exception;

/**
 * Exception thrown when there's a problem with zoning updates
 */
public class ZoningUpdateException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public ZoningUpdateException(String message) {
        super(message);
    }

    public ZoningUpdateException(String message, Throwable cause) {
        super(message, cause);
    }
}
