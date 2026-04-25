<?php
/**
 * ESS API — Login Endpoint
 * POST: Validate mobile + PIN, return JWT token and employee data
 */

require_once __DIR__ . '/config.php';

// Only POST allowed
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOutput(['success' => false, 'error' => 'Method not allowed. Use POST.'], 405);
}

try {
    validateApiKey();

    $input = getInput();
    $mobile = trim($input['mobile_number'] ?? '');
    $pin = trim($input['pin'] ?? '');

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
    // Reset counter if window expired
    if ($rateData['last_attempt'] < $windowStart) {
        $rateData = ['attempts' => 0, 'last_attempt' => 0];
    }

    if ($rateData['attempts'] >= 5) {
        $retryAfter = 60 - (time() - $rateData['last_attempt']);
        jsonOutput([
            'success' => false,
            'error' => 'Too many login attempts. Please try again later.',
            'retry_after_seconds' => max(0, $retryAfter)
        ], 429);
    }

    // ─── Database Lookup ──────────────────────────────────────────────────
    $conn = getDbConnection();

    // Find employee by mobile number with approved status
    $stmt = $conn->prepare('
        SELECT e.*, c.name AS client_name, c.client_code, u.name AS unit_name
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
        jsonOutput(['success' => false, 'error' => 'Invalid mobile number or PIN'], 401);
    }

    // ─── PIN Validation ───────────────────────────────────────────────────
    $storedPin = $employee['pin'];
    $validPin = false;

    // Check stored PIN first
    if (!empty($storedPin) && $storedPin === $pin) {
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
        jsonOutput(['success' => false, 'error' => 'Invalid mobile number or PIN'], 401);
    }

    // ─── Determine Role ───────────────────────────────────────────────────
    $role = _determineRole($employee);

    // ─── Update Employee Cache ────────────────────────────────────────────
    $employeeId = (string)$employee['id'];
    $hasCustomPin = ($employee['has_custom_pin'] ?? 0) == 1 ? 1 : 0;

    // Upsert into ess_employee_cache
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
    $city = $employee['city'] ?? '';
    $state = $employee['state'] ?? '';
    $profilePicUrl = $employee['profile_pic_url'] ?? '';
    $designation = $employee['designation'] ?? '';
    $employeeCode = $employee['employee_code'] ?? '';
    $clientId = (int)($employee['client_id'] ?? 0);
    $unitId = (int)($employee['unit_id'] ?? 0);

    $cacheStmt->bind_param('ssissssissssssi',
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
        'designation' => $employee['designation'] ?? '',
        'department' => $employee['department'] ?? '',
        'employee_code' => $employeeCode,
        'role' => $role,
        'has_custom_pin' => $hasCustomPin,
        'profile_pic_url' => $profilePicUrl,
        'city' => $city,
        'state' => $state,
        'unit_name' => $unitName,
        'client_name' => $clientName,
        'date_of_joining' => $employee['date_of_joining'] ?? '',
    ];

    jsonOutput([
        'success' => true,
        'data' => [
            'employee' => $employeeData,
            'role' => $role,
            'token' => $token
        ]
    ]);

} catch (Exception $e) {
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Track a failed login attempt
 */
function _trackFailedAttempt(string $rateFile, array $rateData): void
{
    $rateData['attempts']++;
    $rateData['last_attempt'] = time();
    @file_put_contents($rateFile, json_encode($rateData), LOCK_EX);
}

/**
 * Determine employee role based on employee_role and worker_category
 */
function _determineRole(array $employee): string
{
    $employeeRole = strtolower($employee['employee_role'] ?? '');
    $appRole = strtolower($employee['app_role'] ?? '');
    $workerCategory = strtolower($employee['worker_category'] ?? '');

    // Check app_role first (most specific)
    if (in_array($appRole, ['manager', 'regional_manager'])) {
        return $appRole;
    }

    // Check employee_role
    if (in_array($employeeRole, ['admin', 'manager'])) {
        return $employeeRole;
    }

    // Check worker_category for supervisor roles
    if (strpos($workerCategory, 'supervisor') !== false) {
        return 'supervisor';
    }

    // Default
    return 'employee';
}
