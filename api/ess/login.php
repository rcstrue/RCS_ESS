<?php
/**
 * RCS ESS - Login API
 * POST: Login with mobile number + PIN
 *
 * Flow:
 * 1. Check ess_employee_cache for employee — if found with a PIN, verify that PIN
 * 2. If not in cache or cache.pin is null → check employees table, verify against birth year
 * 3. On successful login: upsert ess_employee_cache with all employee data
 * 4. If first-time login (birth year match): return first_login=true so frontend prompts PIN change
 * 5. If custom PIN set in cache: verify that PIN directly
 *
 * DB: ess_employee_cache.pin is VARCHAR(4), null = use birth year
 */

@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'POST') {
    jsonError('Method not allowed. Use POST.', 405);
}

$data = getJsonInput();

$mobileNumber = getRequiredParam($data, 'mobileNumber');
$pin          = getRequiredParam($data, 'pin');

// Clean mobile number
$mobile = preg_replace('/\D/', '', $mobileNumber);

if (strlen($mobile) !== 10) {
    jsonError('Mobile number must be 10 digits', 400);
}

if (!preg_match('/^\d{4}$/', $pin)) {
    jsonError('PIN must be 4 digits', 400);
}

// ── Step 1: Check ess_employee_cache ──
$stmt = $conn->prepare("SELECT * FROM ess_employee_cache WHERE mobile_number = ?");
safeBindParam($stmt, 's', [$mobile]);
$stmt->execute();
$result = $stmt->get_result();
$cached = $result->fetch_assoc();
$result->free();
$stmt->close();

$pinMatch = false;
$firstLogin = false;
$employee = null;

if ($cached) {
    // Employee found in cache
    if ($cached['pin'] !== null && $cached['pin'] !== '') {
        // Has custom PIN in cache — verify that
        if ($cached['pin'] === $pin) {
            $pinMatch = true;
        }
    } else {
        // No custom PIN — verify against birth year from employees table
        $empId = intval($cached['employee_id']);
        $stmt = $conn->prepare("SELECT date_of_birth FROM employees WHERE id = ?");
        safeBindParam($stmt, 'i', [$empId]);
        $stmt->execute();
        $result = $stmt->get_result();
        $empRow = $result->fetch_assoc();
        $result->free();
        $stmt->close();

        if ($empRow && $empRow['date_of_birth']) {
            $birthYear = date('Y', strtotime($empRow['date_of_birth']));
            if ($pin === $birthYear) {
                $pinMatch = true;
                $firstLogin = true;
            }
        }
    }

    if ($pinMatch) {
        // Build employee object from cache + employees table
        $empId = intval($cached['employee_id']);
        $stmt = $conn->prepare("SELECT * FROM employees WHERE id = ? AND status = 'approved'");
        safeBindParam($stmt, 'i', [$empId]);
        $stmt->execute();
        $result = $stmt->get_result();
        $employee = $result->fetch_assoc();
        $result->free();
        $stmt->close();
    }
} else {
    // ── Step 2: Not in cache — find in employees table ──
    $stmt = $conn->prepare("SELECT * FROM employees WHERE mobile_number = ? AND status = 'approved' LIMIT 1");
    safeBindParam($stmt, 's', [$mobile]);
    $stmt->execute();
    $result = $stmt->get_result();
    $employee = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if ($employee) {
        // Verify against birth year (first time login)
        if ($employee['date_of_birth']) {
            $birthYear = date('Y', strtotime($employee['date_of_birth']));
            if ($pin === $birthYear) {
                $pinMatch = true;
                $firstLogin = true;
            }
        }
    }
}

if (!$pinMatch) {
    jsonError('Incorrect PIN. Please try again.', 401);
}

if (!$employee) {
    jsonError('Employee not found. Please contact HR.', 404);
}

// ── Step 3: Determine role ──
$category = strtolower($employee['worker_category'] ?? '');
$role     = strtolower($employee['employee_role'] ?? '');

$essRole = 'employee';
if (strpos($category, 'regional') !== false || strpos($role, 'regional') !== false) {
    $essRole = 'regional_manager';
} elseif (strpos($category, 'manager') !== false || strpos($role, 'manager') !== false) {
    $essRole = 'manager';
} elseif (strpos($category, 'supervisor') !== false || strpos($role, 'supervisor') !== false || strpos($category, 'team lead') !== false) {
    $essRole = 'supervisor';
}

// Remove sensitive fields
unset($employee['pin']);

// ── Step 4: Upsert ess_employee_cache ──
$empId = strval($employee['id']);

// Get unit details
$stmt = $conn->prepare("SELECT u.id as unit_id, u.name as unit_name, u.city, u.state,
                                c.id as client_id, c.name as client_name
                         FROM units u
                         LEFT JOIN clients c ON u.client_id = c.id
                         WHERE u.id = ?");
safeBindParam($stmt, 'i', [$employee['unit_id']]);
$stmt->execute();
$result = $stmt->get_result();
$unitRow = $result->fetch_assoc();
$result->free();
$stmt->close();

$unitId      = $unitRow ? strval($unitRow['unit_id'] ?? '') : '';
$unitName    = $unitRow ? ($unitRow['unit_name'] ?? '') : '';
$city        = $unitRow ? ($unitRow['city'] ?? '') : '';
$state       = $unitRow ? ($unitRow['state'] ?? '') : '';
$clientId    = $unitRow ? strval($unitRow['client_id'] ?? '') : '';
$clientName  = $unitRow ? ($unitRow['client_name'] ?? '') : '';

// Check if cache entry exists
$stmt = $conn->prepare("SELECT employee_id FROM ess_employee_cache WHERE employee_id = ?");
safeBindParam($stmt, 's', [$empId]);
$stmt->execute();
$result = $stmt->get_result();
$exists = $result->num_rows > 0;
$result->free();
$stmt->close();

if ($exists) {
    // Update existing cache entry (don't overwrite PIN)
    $stmt = $conn->prepare("UPDATE ess_employee_cache SET
                            role = ?,
                            unit_id = ?,
                            unit_name = ?,
                            city = ?,
                            state = ?,
                            client_name = ?,
                            client_id = ?,
                            full_name = ?,
                            mobile_number = ?,
                            designation = ?,
                            profile_pic_url = ?,
                            employee_code = ?,
                            updated_at = NOW()
                            WHERE employee_id = ?");
    safeBindParam($stmt, 'sssssssssssss', [
        $essRole, $unitId, $unitName, $city, $state,
        $clientId, $clientName,
        $employee['full_name'], $employee['mobile_number'],
        $employee['designation'] ?? '',
        $employee['profile_pic_url'] ?? '',
        $employee['employee_code'] ?? '',
        $empId
    ]);
    $stmt->execute();
    $stmt->close();
} else {
    // Insert new cache entry (no PIN yet)
    $stmt = $conn->prepare("INSERT INTO ess_employee_cache
                            (employee_id, role, unit_id, unit_name, city, state, client_name, client_id,
                             full_name, mobile_number, designation, profile_pic_url, pin, employee_code, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NOW())");
    safeBindParam($stmt, 'sssssssssssss', [
        $empId, $essRole, $unitId, $unitName, $city, $state,
        $clientId, $clientName,
        $employee['full_name'], $employee['mobile_number'],
        $employee['designation'] ?? '',
        $employee['profile_pic_url'] ?? '',
        $employee['employee_code'] ?? ''
    ]);
    $stmt->execute();
    $stmt->close();
}

// ── Step 5: Return response ──
$response = [
    'employee'      => $employee,
    'role'          => $essRole,
    'first_login'   => $firstLogin,
    'has_custom_pin' => !$firstLogin,
];

jsonSuccess($response, $firstLogin ? 'First login — please set your PIN' : 'Login successful');
