package com.realestate.zoningupdate.exception;

/**
 * Exception thrown when a database permission issue occurs
 */
public class DatabasePermissionException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DatabasePermissionException(String message) {
        super(message);
    }

    public DatabasePermissionException(String message, Throwable cause) {
        super(message, cause);
    }
}
