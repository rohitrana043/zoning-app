package com.realestate.zoningupdate.dto;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

@Data
@NoArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AuditLogEntry {

    // Use ISO format for timestamps - this makes them compatible with JavaScript
    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    private LocalDateTime timestamp;

    private String action;
    private String details;
    private String username;

    public AuditLogEntry(LocalDateTime timestamp, String action, String details, String username) {
        this.timestamp = timestamp;
        this.action = action;
        this.details = details;
        this.username = username;
    }

    @Override
    public String toString() {
        return String.format(
                "[%s] %s - Action: %s, User: %s, Details: %s",
                timestamp != null
                        ? timestamp.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                        : "Unknown Time",
                action,
                username,
                details
        );
    }
}