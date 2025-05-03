package com.realestate.zoningupdate.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.realestate.zoningupdate.dto.AuditLogEntry;
import com.realestate.zoningupdate.exception.BusinessException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

@Service
public class AuditService {

    private static final Logger log = LoggerFactory.getLogger(AuditService.class);

    @Value("${audit.log.file:logs/audit-logs.json}")
    private String auditLogFilePath;

    @Value("${audit.log.max-entries:1000}")
    private int maxLogEntries;

    @Value("${audit.log.retention-days:30}")
    private int retentionDays;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // Add a lock to handle concurrent access to the audit log file
    private final ReadWriteLock rwLock = new ReentrantReadWriteLock();

    @PostConstruct
    public void init() {
        // Configure ObjectMapper for consistent serialization
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.configure(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS, false);

        // Ensure the audit log file exists
        try {
            Path path = Paths.get(auditLogFilePath);
            File file = path.toFile();

            // Create parent directories if they don't exist
            if (!file.getParentFile().exists()) {
                boolean created = file.getParentFile().mkdirs();
                if (!created) {
                    log.warn("Failed to create directory for audit logs: {}", file.getParentFile().getAbsolutePath());
                }
            }

            if (!file.exists()) {
                try {
                    Files.createFile(path);
                    // Initialize with empty array
                    objectMapper.writeValue(file, new ArrayList<>());
                    log.info("Created new audit log file at {}", file.getAbsolutePath());
                } catch (IOException e) {
                    log.error("Failed to create or initialize audit log file: {}", e.getMessage(), e);
                }
            } else {
                // Validate file is proper JSON
                try {
                    objectMapper.readValue(file,
                            objectMapper.getTypeFactory().constructCollectionType(List.class, AuditLogEntry.class));
                    log.info("Validated existing audit log file at {}", file.getAbsolutePath());
                } catch (IOException e) {
                    log.error("Existing audit log file is corrupted. Creating backup and initializing new file.", e);
                    // Backup corrupted file
                    Path backupPath = Paths.get(auditLogFilePath + ".backup." + System.currentTimeMillis());
                    try {
                        Files.copy(path, backupPath);
                        log.info("Created backup of corrupted file at {}", backupPath);
                        // Initialize with empty array
                        objectMapper.writeValue(file, new ArrayList<>());
                    } catch (IOException backupError) {
                        log.error("Failed to create backup of corrupted audit log file", backupError);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to initialize audit log file: {}", e.getMessage(), e);
        }
    }

    public void logAuditEvent(String action, String details, String username) {
        if (action == null || action.trim().isEmpty()) {
            log.warn("Attempted to log audit event with null or empty action");
            return;
        }

        try {
            // Create the log entry
            AuditLogEntry logEntry = new AuditLogEntry();
            logEntry.setTimestamp(LocalDateTime.now());
            logEntry.setAction(action);
            logEntry.setDetails(details != null ? details : "No details provided");
            logEntry.setUsername(username != null ? username : "system");

            rwLock.writeLock().lock();
            try {
                List<AuditLogEntry> existingLogs = readExistingLogs();
                existingLogs.add(logEntry);

                // Enforce max entries limit
                if (existingLogs.size() > maxLogEntries) {
                    existingLogs = existingLogs.subList(
                            existingLogs.size() - maxLogEntries,
                            existingLogs.size()
                    );
                }

                File file = new File(auditLogFilePath);
                objectMapper.writeValue(file, existingLogs);

                log.info("Audit log entry created: {}", logEntry);
            } catch (IOException e) {
                log.error("Failed to write to audit log file: {}", e.getMessage(), e);
            } finally {
                rwLock.writeLock().unlock();
            }
        } catch (Exception e) {
            log.error("Unexpected error during audit logging: {}", e.getMessage(), e);
        }
    }

    /**
     * Prune logs older than the retention period
     *
     * @param logs List of audit log entries to be pruned
     */
    private void pruneOldLogs(List<AuditLogEntry> logs) {
        if (logs == null || logs.isEmpty()) {
            return;
        }

        try {
            // Calculate the cutoff date based on retention days
            LocalDateTime retentionCutoff = LocalDateTime.now().minusDays(retentionDays);

            // Track how many logs will be removed
            int initialSize = logs.size();

            // Remove logs older than the cutoff date
            logs.removeIf(log -> {
                // Handle potential null timestamp
                if (log.getTimestamp() == null) {
                    return true; // Remove entries with null timestamps
                }

                // Remove if timestamp is before the cutoff date
                return log.getTimestamp().isBefore(retentionCutoff);
            });

            int removedCount = initialSize - logs.size();
            if (removedCount > 0) {
                log.info("Pruned {} old audit logs based on {} day retention policy",
                        removedCount, retentionDays);
            }
        } catch (Exception e) {
            // Log the error but don't interrupt the logging process
            log.error("Error pruning old audit logs: {}", e.getMessage(), e);
        }
    }

    private List<AuditLogEntry> readExistingLogs() {
        rwLock.readLock().lock();
        try {
            File file = new File(auditLogFilePath);
            if (!file.exists() || file.length() == 0) {
                log.info("Audit log file is empty or doesn't exist, returning empty list");
                return new ArrayList<>();
            }

            try {
                // Read logs
                List<AuditLogEntry> logs = objectMapper.readValue(file,
                        objectMapper.getTypeFactory().constructCollectionType(List.class, AuditLogEntry.class));

                // Prune old logs
                pruneOldLogs(logs);

                return logs;
            } catch (IOException e) {
                log.error("Failed to read existing audit logs: {}", e.getMessage(), e);

                // Attempt recovery by initializing with empty array
                try {
                    log.info("Attempting recovery by initializing audit log file with empty array");
                    objectMapper.writeValue(file, new ArrayList<>());
                } catch (IOException recoveryError) {
                    log.error("Recovery attempt failed", recoveryError);
                }

                return new ArrayList<>();
            }
        } catch (Exception e) {
            log.error("Unexpected error reading audit logs: {}", e.getMessage(), e);
            return new ArrayList<>();
        } finally {
            rwLock.readLock().unlock();
        }
    }

    /**
     * Retrieve all audit logs.
     * This method can be used for administrative purposes to view the audit trail.
     *
     * @return A list of all audit log entries
     */
    public List<AuditLogEntry> getAllAuditLogs() {
        try {
            List<AuditLogEntry> logs = readExistingLogs();
            log.info("Retrieved {} audit logs", logs.size());
            return logs;
        } catch (Exception e) {
            log.error("Error retrieving audit logs", e);
            throw new BusinessException("Unable to retrieve audit logs", e);
        }
    }

    /**
     * Get audit logs filtered by username
     *
     * @param username The username to filter by
     * @return List of audit log entries for the specified user
     */
    public List<AuditLogEntry> getAuditLogsByUser(String username) {
        if (username == null || username.isEmpty()) {
            throw new BusinessException("Username cannot be empty");
        }

        try {
            List<AuditLogEntry> allLogs = readExistingLogs();
            List<AuditLogEntry> filteredLogs = allLogs.stream()
                    .filter(entry -> username.equals(entry.getUsername()))
                    .toList();

            log.info("Retrieved {} audit logs for user {}", filteredLogs.size(), username);
            return filteredLogs;
        } catch (Exception e) {
            log.error("Error retrieving audit logs for user: {}", username, e);
            throw new BusinessException("Unable to retrieve audit logs for user: " + username, e);
        }
    }

    /**
     * Get audit logs filtered by action type
     *
     * @param action The action type to filter by
     * @return List of audit log entries for the specified action
     */
    public List<AuditLogEntry> getAuditLogsByAction(String action) {
        if (action == null || action.isEmpty()) {
            throw new BusinessException("Action cannot be empty");
        }

        try {
            List<AuditLogEntry> allLogs = readExistingLogs();
            List<AuditLogEntry> filteredLogs = allLogs.stream()
                    .filter(entry -> action.equals(entry.getAction()))
                    .toList();

            log.info("Retrieved {} audit logs for action {}", filteredLogs.size(), action);
            return filteredLogs;
        } catch (Exception e) {
            log.error("Error retrieving audit logs for action: {}", action, e);
            throw new BusinessException("Unable to retrieve audit logs for action: " + action, e);
        }
    }
}