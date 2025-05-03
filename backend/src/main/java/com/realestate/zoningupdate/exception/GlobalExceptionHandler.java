package com.realestate.zoningupdate.exception;

import org.hibernate.exception.ConstraintViolationException;
import org.postgresql.util.PSQLException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.PermissionDeniedDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.context.request.WebRequest;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import lombok.extern.slf4j.Slf4j;


@ControllerAdvice
@Slf4j
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<?> handleResourceNotFoundException(
            ResourceNotFoundException ex, WebRequest request) {

        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                HttpStatus.NOT_FOUND.value(),
                "Resource Not Found",
                ex.getMessage(),
                request.getDescription(false));

        return new ResponseEntity<>(errorDetails, HttpStatus.NOT_FOUND);
    }

    /**
     * Handle database permission errors
     */
    @ExceptionHandler({PermissionDeniedDataAccessException.class})
    public ResponseEntity<?> handlePermissionDeniedError(
            Exception ex, WebRequest request) {

        log.error("Database permission error: {}", ex.getMessage());

        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                HttpStatus.FORBIDDEN.value(),
                "Permission Denied",
                "You don't have permission to perform this operation. Please contact the administrator.",
                request.getDescription(false));

        return new ResponseEntity<>(errorDetails, HttpStatus.FORBIDDEN);
    }

    /**
     * Handle database constraint violations
     */
    @ExceptionHandler({ConstraintViolationException.class, DataIntegrityViolationException.class})
    public ResponseEntity<?> handleConstraintViolation(
            Exception ex, WebRequest request) {

        log.error("Data integrity violation: {}", ex.getMessage());

        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                HttpStatus.BAD_REQUEST.value(),
                "Data Integrity Violation",
                "The operation violated a database constraint. Please check your data.",
                request.getDescription(false));

        return new ResponseEntity<>(errorDetails, HttpStatus.BAD_REQUEST);
    }

    /**
     * Handle PostgreSQL specific exceptions
     */
    @ExceptionHandler(PSQLException.class)
    public ResponseEntity<?> handlePSQLException(
            PSQLException ex, WebRequest request) {

        log.error("PostgreSQL error: {}", ex.getMessage());

        // Extract SQL State Code
        String sqlState = ex.getSQLState();
        String errorMessage = ex.getMessage();
        HttpStatus status = HttpStatus.INTERNAL_SERVER_ERROR;
        String title = "Database Error";

        // Handle based on PostgreSQL error codes
        // https://www.postgresql.org/docs/current/errcodes-appendix.html
        if (sqlState != null) {
            switch (sqlState) {
                case "42501": // permission_denied
                    status = HttpStatus.FORBIDDEN;
                    title = "Permission Denied";
                    errorMessage = "You don't have permission to perform this operation. Please contact the administrator.";
                    break;
                case "23505": // unique_violation
                    status = HttpStatus.CONFLICT;
                    title = "Duplicate Entry";
                    errorMessage = "The record already exists.";
                    break;
                case "23503": // foreign_key_violation
                    status = HttpStatus.BAD_REQUEST;
                    title = "Referenced Data Missing";
                    errorMessage = "The operation references data that doesn't exist.";
                    break;
                case "42P01": // undefined_table
                    status = HttpStatus.INTERNAL_SERVER_ERROR;
                    title = "Database Configuration Error";
                    errorMessage = "The database table doesn't exist. Please contact the administrator.";
                    break;
                default:
                    // Default handling for other PostgreSQL errors
                    break;
            }
        }

        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                status.value(),
                title,
                errorMessage,
                request.getDescription(false));

        return new ResponseEntity<>(errorDetails, status);
    }

    /**
     * Handle general database access exceptions
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<?> handleDataAccessException(
            DataAccessException ex, WebRequest request) {

        log.error("Database access error: {}", ex.getMessage());

        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "Database Error",
                "An error occurred while accessing the database. Please try again later.",
                request.getDescription(false));

        return new ResponseEntity<>(errorDetails, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    /**
     * Handle validation errors
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<?> handleValidationExceptions(
            MethodArgumentNotValidException ex, WebRequest request) {

        Map<String, String> errors = new HashMap<>();

        ex.getBindingResult().getFieldErrors().forEach(error ->
                errors.put(error.getField(), error.getDefaultMessage())
        );

        ValidationErrorResponse errorDetails = new ValidationErrorResponse(
                new Date(),
                HttpStatus.BAD_REQUEST.value(),
                "Validation Error",
                "Please correct the invalid input fields",
                request.getDescription(false),
                errors);

        return new ResponseEntity<>(errorDetails, HttpStatus.BAD_REQUEST);
    }

    /**
     * Handle ZoningUpdateException
     */
    @ExceptionHandler(ZoningUpdateException.class)
    public ResponseEntity<?> handleZoningUpdateException(
            ZoningUpdateException ex, WebRequest request) {

        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                HttpStatus.BAD_REQUEST.value(),
                "Zoning Update Error",
                ex.getMessage(),
                request.getDescription(false));

        return new ResponseEntity<>(errorDetails, HttpStatus.BAD_REQUEST);
    }

    /**
     * Handle all other exceptions
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleGlobalException(
            Exception ex, WebRequest request) {

        // Log the full stack trace for internal server errors
        log.error("Unhandled exception occurred: ", ex);

        // Default error response
        ErrorResponse errorDetails = new ErrorResponse(
                new Date(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                "System Error",
                "An unexpected error occurred. Please try again later or contact support if the issue persists.",
                request.getDescription(false));

        // More specific handling for business exceptions
        if (ex instanceof BusinessException) {
            errorDetails.setError("Business Logic Error");
            errorDetails.setMessage(ex.getMessage());
            errorDetails.setStatus(HttpStatus.BAD_REQUEST.value());
            return new ResponseEntity<>(errorDetails, HttpStatus.BAD_REQUEST);
        }

        // Specific handling for audit-related issues
        if (ex.getMessage() != null && ex.getMessage().contains("audit")) {
            errorDetails.setError("Audit Log Error");
            errorDetails.setMessage("Failed to retrieve or process audit logs.");
        }

        return new ResponseEntity<>(errorDetails, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}