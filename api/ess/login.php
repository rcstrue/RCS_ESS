<?php
/**
 * ESS API — Login Endpoint
 * POST: Validate mobile + PIN, return JWT token and employee data
 *
 * Schema reference: rcsfaxhz_bolt.txt (actual phpMyAdmin dump)
 * employees table: pin (plaintext varchar), status enum, NO is_active, NO pin_hash, NO city, NO has_custom_pin
 */

require_once __DIR__ . '/config.php';

// Only POST allowed
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOutput(['success' => false, 'error' => 'Method not allowed. Use POST.'], 405);
}

try {
    validateApiKey();

    $input = getInput();
    $mobile = trim($input['mobile_number'] ?? $input['mobileNumber'] ?? '');
    $pin = trim($input['pin'] ?? '');

    essLog("Login attempt: mobile=" . substr($mobile, 0, 4) . "****");

    // ─── Input Validation ─────────────────────────────────────────────────
    if (empty($mobile)) {
        jsonOutput(['success' => false, 'error' => 'Mobile number is required'], 400);
    }
    if (empty($pin) || !preg_match('/^\d{4,10}$/', $pin)) {
        jsonOutput(['success' => false, 'error' => 'Invalid PIN format'], 400);
    }

    // ─── Rate Limiting (file-based, 5 attempts per 60s per mobile+IP) ────
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rateKey = md5('ess_login_' . $mobile . '_' . $ip);
    $rateFile = sys_get_temp_dir() . '/' . $rateKey . '.json';

    $rateData = ['attempts' => 0, 'last_attempt' => 0];
    if (file_exists($rateFile)) {
        $rateData = json_decode(file_get_contents($rateFile), true) ?: $rateData;
    }

    $windowStart = time() - 60;
    if ($rateData['last_attempt'] < $windowStart) {
        $rateData = ['attempts' => 0, 'last_attempt' => 0];
    }

    if ($rateData['attempts'] >= 5) {
        $retryAfter = 60 - (time() - $rateData['last_attempt']);
        essLog("Rate limited: mobile=" . substr($mobile, 0, 4) . "****, attempts={$rateData['attempts']}");
        jsonOutput([
            'success' => false,
            'error' => 'Too many login attempts. Please try again later.',
            'retry_after_seconds' => max(0, $retryAfter)
        ], 429);
    }

    // ─── Database Lookup ──────────────────────────────────────────────────
    // REAL SCHEMA: employees.status is enum('approved','pending_hr_verification','inactive','terminated','removed')
    // employees.pin is varchar(10) PLAINTEXT (not hashed)
    // NO is_active, NO pin_hash, NO has_custom_pin, NO city column
    // app_role enum('employee','manager','regional_manager') EXISTS
    // gender varchar(20) EXISTS
    // district varchar(100) EXISTS (not city)
    $conn = getDbConnection();

    $stmt = $conn->prepare('
        SELECT
            e.id, e.full_name, e.mobile_number, e.email, e.designation, e.department,
            e.district, e.state, e.date_of_joining, e.date_of_birth, e.gender,
            e.employee_code, e.profile_pic_url, e.pin,
            e.employee_role, e.app_role, e.worker_category,
            e.client_id, e.unit_id, e.status,
            c.name AS client_name, c.client_code,
            u.name AS unit_name
        FROM employees e
        LEFT JOIN clients c ON c.id = e.client_id
        LEFT JOIN units u ON u.id = e.unit_id
        WHERE e.mobile_number = ? AND e.status = ?
    ');
    $approvedStatus = 'approved';
    $stmt->bind_param('ss', $mobile, $approvedStatus);
    $stmt->execute();
    $result = $stmt->get_result();
    $employee = $result->fetch_assoc();
    $stmt->close();

    if (!$employee) {
        _trackFailedAttempt($rateFile, $rateData);
        essLog("Login failed: mobile not found or not approved");
        jsonOutput(['success' => false, 'error' => 'Invalid mobile number or PIN'], 401);
    }

    // ─── PIN Validation (PLAINTEXT compare — real schema has pin varchar(10), not pin_hash) ─
    $validPin = false;

    // Check stored PIN (plaintext)
    if (!empty($employee['pin']) && $employee['pin'] === $pin) {
        $validPin = true;
    }

    // Fallback: check if PIN matches last 4 digits of birth year
    if (!$validPin && !empty($employee['date_of_birth'])) {
        $birthYear = substr($employee['date_of_birth'], 0, 4);
        if ($birthYear === $pin) {
            $validPin = true;
        }
    }

    if (!$validPin) {
        _trackFailedAttempt($rateFile, $rateData);
        essLog("Login failed: wrong PIN, emp={$employee['id']}");
        jsonOutput(['success' => false, 'error' => 'Invalid mobile number or PIN'], 401);
    }

    // ─── Determine Role ───────────────────────────────────────────────────
    $role = _determineRole($employee);

    // ─── Update Employee Cache ────────────────────────────────────────────
    $employeeId = (string)$employee['id'];

    // ess_employee_cache schema: city varchar(100), state varchar(100), pin varchar(4), employee_code varchar(50)
    // employees table has NO city — use district for cache.city
    // employees table has NO has_custom_pin — skip
    $cacheStmt = $conn->prepare('
        INSERT INTO ess_employee_cache (
            employee_id, role, unit_id, unit_name, city, state,
            client_name, client_id, full_name, mobile_number,
            designation, profile_pic_url, pin, employee_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            role = VALUES(role),
            unit_id = VALUES(unit_id),
            unit_name = VALUES(unit_name),
            city = VALUES(city),
            state = VALUES(state),
            client_name = VALUES(client_name),
            client_id = VALUES(client_id),
            full_name = VALUES(full_name),
            mobile_number = VALUES(mobile_number),
            designation = VALUES(designation),
            profile_pic_url = VALUES(profile_pic_url),
            pin = VALUES(pin),
            employee_code = VALUES(employee_code)
    ');

    $unitName = $employee['unit_name'] ?? '';
    $clientName = $employee['client_name'] ?? '';
    $city = $employee['district'] ?? ''; // employees has district, not city
    $state = $employee['state'] ?? '';
    $profilePicUrl = $employee['profile_pic_url'] ?? '';
    $designation = $employee['designation'] ?? '';
    $employeeCode = (string)($employee['employee_code'] ?? '');
    $clientId = (string)($employee['client_id'] ?? '');
    $unitId = (string)($employee['unit_id'] ?? '');
    $storedPin = substr($employee['pin'] ?? '', 0, 4); // cache.pin is varchar(4)

    $cacheStmt->bind_param('ssssssssssssss',
        $employeeId, $role, $unitId, $unitName, $city, $state,
        $clientName, $clientId, $employee['full_name'], $employee['mobile_number'],
        $designation, $profilePicUrl, $storedPin, $employeeCode
    );
    $cacheStmt->execute();
    $cacheStmt->close();

    // ─── Generate JWT ─────────────────────────────────────────────────────
    $token = SimpleJWT::encode([
        'employee_id' => $employeeId,
        'role' => $role,
        'full_name' => $employee['full_name']
    ], 86400); // 24 hours

    // ─── Clear Rate Limit File on Success ─────────────────────────────────
    @unlink($rateFile);

    // ─── Return Response ──────────────────────────────────────────────────
    $employeeData = [
        'employee_id' => $employeeId,
        'full_name' => $employee['full_name'],
        'mobile_number' => $employee['mobile_number'],
        'email' => $employee['email'] ?? '',
        'designation' => $designation,
        'department' => $employee['department'] ?? '',
        'employee_code' => $employeeCode,
        'role' => $role,
        'has_custom_pin' => 0, // column doesn't exist in employees table
        'profile_pic_url' => $profilePicUrl,
        'city' => $city, // populated from district
        'state' => $state,
        'unit_name' => $unitName,
        'client_name' => $clientName,
        'date_of_joining' => $employee['date_of_joining'] ?? '',
        'gender' => $employee['gender'] ?? '',
    ];

    essLog("Login success: emp={$employeeId}, role={$role}");

    jsonOutput([
        'success' => true,
        'data' => [
            'employee' => $employeeData,
            'role' => $role,
            'token' => $token
        ]
    ]);

} catch (Throwable $e) {
    essLog("FATAL login: {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
    jsonOutput([
        'success' => false,
        'error' => 'Internal server error',
        '_debug' => [
            'message' => $e->getMessage(),
            'file' => basename($e->getFile()),
            'line' => $e->getLine(),
        ]
    ], 500);
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function _trackFailedAttempt(string $rateFile, array $rateData): void
{
    $rateData['attempts']++;
    $rateData['last_attempt'] = time();
    @file_put_contents($rateFile, json_encode($rateData), LOCK_EX);
}

/**
 * Determine role based on employee_role and app_role
 * Schema: employee_role enum('admin','manager','employee')
 *         app_role enum('employee','manager','regional_manager')
 *         worker_category enum('Skilled','Semi-Skilled','Unskilled','Supervisor','Manager','Other')
 */
function _determineRole(array $employee): string
{
    $appRole = strtolower($employee['app_role'] ?? 'employee');
    $employeeRole = strtolower($employee['employee_role'] ?? 'employee');
    $workerCategory = strtolower($employee['worker_category'] ?? '');

    // app_role takes priority (most specific)
    if (in_array($appRole, ['manager', 'regional_manager'])) {
        return $appRole;
    }

    // employee_role
    if (in_array($employeeRole, ['admin', 'manager'])) {
        return $employeeRole;
    }

    // worker_category for supervisor
    if (strpos($workerCategory, 'supervisor') !== false) {
        return 'supervisor';
    }

    return 'employee';
}
