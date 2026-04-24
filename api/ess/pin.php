<?php
/**
 * RCS ESS - PIN Management API
 * POST: Change employee PIN (saves to ess_employee_cache)
 *
 * Flow:
 * 1. Verify current PIN (either custom PIN from cache or birth year from employees table)
 * 2. Hash the new PIN and save to ess_employee_cache.pin
 *
 * DB: ess_employee_cache.pin is VARCHAR(4), null = use birth year
 */

require_once __DIR__ . '/cors.php';
@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonError('Method not allowed. Use POST.', 405);
}

$data = getJsonInput();

$employeeId = getRequiredParam($data, 'employee_id');
$currentPin = getRequiredParam($data, 'current_pin');
$newPin     = getRequiredParam($data, 'new_pin');

// Validate new PIN
if (!preg_match('/^\d{4}$/', $newPin)) {
    jsonError('PIN must be exactly 4 digits', 400);
}

if ($currentPin === $newPin) {
    jsonError('New PIN must be different from current PIN', 400);
}

// ── Step 1: Check ess_employee_cache ──
$stmt = $conn->prepare("SELECT * FROM ess_employee_cache WHERE employee_id = ?");
safeBindParam($stmt, 's', [$employeeId]);
$stmt->execute();
$result = $stmt->get_result();
$cached = $result->fetch_assoc();
$result->free();
$stmt->close();

$pinMatch = false;

if ($cached) {
    if ($cached['pin'] !== null && $cached['pin'] !== '') {
        // Verify against custom PIN in cache
        if ($cached['pin'] === $currentPin) {
            $pinMatch = true;
        }
    } else {
        // No custom PIN yet — verify against birth year
        $empId = intval($employeeId);
        $stmt = $conn->prepare("SELECT date_of_birth FROM employees WHERE id = ?");
        safeBindParam($stmt, 'i', [$empId]);
        $stmt->execute();
        $result = $stmt->get_result();
        $empRow = $result->fetch_assoc();
        $result->free();
        $stmt->close();

        if ($empRow && $empRow['date_of_birth']) {
            $birthYear = date('Y', strtotime($empRow['date_of_birth']));
            if ($currentPin === $birthYear) {
                $pinMatch = true;
            }
        }
    }
}

if (!$pinMatch) {
    jsonError('Current PIN is incorrect', 400);
}

// ── Step 2: Save new PIN to ess_employee_cache ──
$stmt = $conn->prepare("UPDATE ess_employee_cache SET pin = ?, updated_at = NOW() WHERE employee_id = ?");
safeBindParam($stmt, 'ss', [$newPin, $employeeId]);
$stmt->execute();
$stmt->close();

jsonSuccess(null, 'PIN changed successfully');
