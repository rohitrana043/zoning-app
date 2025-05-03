package com.realestate.zoningupdate.controller;

import com.realestate.zoningupdate.dto.AuditLogEntry;
import com.realestate.zoningupdate.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/audit")
@CrossOrigin(origins = "*")
@RequiredArgsConstructor
@Slf4j
public class AuditController {

    private final AuditService auditService;


    /**
     * Retrieve all audit logs
     *
     * @return List of audit log entries
     */
    @GetMapping("/logs")
    public ResponseEntity<List<AuditLogEntry>> getAllAuditLogs() {
        log.info("Fetching all audit logs");
        List<AuditLogEntry> logs = auditService.getAllAuditLogs();
        return ResponseEntity.ok(logs);
    }

    /**
     * Retrieve audit logs filtered by username
     *
     * @param username Username to filter logs
     * @return List of audit log entries for the specified user
     */
    @GetMapping("/logs/user")
    public ResponseEntity<List<AuditLogEntry>> getAuditLogsByUser(
            @RequestParam String username) {
        log.info("Fetching audit logs for user: {}", username);
        List<AuditLogEntry> logs = auditService.getAuditLogsByUser(username);
        return ResponseEntity.ok(logs);
    }

    /**
     * Retrieve audit logs filtered by action type
     *
     * @param action Action type to filter logs
     * @return List of audit log entries for the specified action
     */
    @GetMapping("/logs/action")
    public ResponseEntity<List<AuditLogEntry>> getAuditLogsByAction(
            @RequestParam String action) {
        log.info("Fetching audit logs for action: {}", action);
        List<AuditLogEntry> logs = auditService.getAuditLogsByAction(action);
        return ResponseEntity.ok(logs);
    }
}