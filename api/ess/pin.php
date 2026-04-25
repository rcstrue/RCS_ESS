<?php
/**
 * ESS API — Change PIN Endpoint
 * POST: Validate current PIN and update to new PIN
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOutput(['success' => false, 'error' => 'Method not allowed. Use POST.'], 405);
}

try {
    validateApiKey();

    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // ─── Validate Input ───────────────────────────────────────────────────
    $currentPin = trim($input['current_pin'] ?? '');
    $newPin = trim($input['new_pin'] ?? '');

    if (empty($currentPin)) {
        jsonOutput(['success' => false, 'error' => 'Current PIN is required'], 400);
    }
    if (empty($newPin) || !preg_match('/^\d{4,10}$/', $newPin)) {
        jsonOutput(['success' => false, 'error' => 'New PIN must be 4-10 digits'], 400);
    }
    if ($currentPin === $newPin) {
        jsonOutput(['success' => false, 'error' => 'New PIN must be different from current PIN'], 400);
    }

    // ─── Fetch Current Stored PIN ─────────────────────────────────────────
    $intId = (int)$employeeId;
    $stmt = $conn->prepare('SELECT pin, date_of_birth FROM employees WHERE id = ? AND status = ?');
    $approvedStatus = 'approved';
    $stmt->bind_param('is', $intId, $approvedStatus);
    $stmt->execute();
    $employee = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$employee) {
        jsonOutput(['success' => false, 'error' => 'Employee not found'], 404);
    }

    // ─── Validate Current PIN ─────────────────────────────────────────────
    $storedPin = $employee['pin'];
    $currentPinValid = false;

    // Check stored PIN
    if (!empty($storedPin) && $storedPin === $currentPin) {
        $currentPinValid = true;
    }

    // Fallback: check birth year
    if (!$currentPinValid && !empty($employee['date_of_birth'])) {
        $birthYear = substr($employee['date_of_birth'], 0, 4);
        if ($birthYear === $currentPin) {
            $currentPinValid = true;
        }
    }

    if (!$currentPinValid) {
        jsonOutput(['success' => false, 'error' => 'Current PIN is incorrect'], 401);
    }

    // ─── Update PIN ───────────────────────────────────────────────────────
    $updateStmt = $conn->prepare('
        UPDATE employees SET pin = ?, has_custom_pin = 1, updated_at = NOW() WHERE id = ?
    ');
    $updateStmt->bind_param('si', $newPin, $intId);
    $updateStmt->execute();
    $updateStmt->close();

    // Also update in cache
    $cacheStmt = $conn->prepare('UPDATE ess_employee_cache SET pin = ? WHERE employee_id = ?');
    $cacheStmt->bind_param('ss', $newPin, $employeeId);
    $cacheStmt->execute();
    $cacheStmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'message' => 'PIN changed successfully'
        ]
    ]);

} catch (Exception $e) {
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}
