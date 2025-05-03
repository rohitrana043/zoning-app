package com.realestate.zoningupdate.exception;

/**
 * Exception thrown when there's an authentication or authorization failure
 */
public class AuthenticationException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AuthenticationException(String message) {
        super(message);
    }
}
