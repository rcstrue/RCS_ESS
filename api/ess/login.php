<?php
/**
 * ESS API — Login Endpoint
 * POST: Validate mobile + PIN, return JWT token and employee data
 *
 * PIN Logic:
 *   1. Check ess_employee_cache.pin — if set, validate against it (custom PIN)
 *   2. If cache pin is NULL, validate against employees.date_of_birth (birth year, 4 digits)
 *   3. If login via birth year → return has_custom_pin=false → force PIN change
 *   4. Custom PIN is saved ONLY in ess_employee_cache.pin (NOT in employees table)
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonOutput(array('success' => false, 'error' => 'Method not allowed. Use POST.'), 405);
}

try {
    validateApiKey();

    $input = getInput();

    // Accept both camelCase and snake_case field names
    $mobile = trim($input['mobile_number'] ?? $input['mobileNumber'] ?? '');
    $pin = trim($input['pin'] ?? '');

    if (empty($mobile)) {
        jsonOutput(array('success' => false, 'error' => 'Mobile number is required'), 400);
        return;
    }
    if (empty($pin) || !preg_match('/^\d{4,10}$/', $pin)) {
        jsonOutput(array('success' => false, 'error' => 'Invalid PIN format. Use 4-10 digits.'), 400);
        return;
    }

    // ─── Rate Limiting ───────────────────────────────────────────────────
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $rateKey = md5('ess_login_' . $mobile . '_' . $ip);
    $rateFile = sys_get_temp_dir() . '/' . $rateKey . '.json';

    $rateData = array('attempts' => 0, 'last_attempt' => 0);
    if (file_exists($rateFile)) {
        $rateData = json_decode(file_get_contents($rateFile), true) ?: $rateData;
    }
    if ($rateData['last_attempt'] < time() - 60) {
        $rateData = array('attempts' => 0, 'last_attempt' => 0);
    }
    if ($rateData['attempts'] >= 5) {
        $retryAfter = 60 - (time() - $rateData['last_attempt']);
        jsonOutput(array('success' => false, 'error' => 'Too many attempts. Try later.', 'retry_after_seconds' => max(0, $retryAfter)), 429);
        return;
    }

    // ─── Database Lookup — JOIN units for city ───────────────────────────
    $conn = getDbConnection();

    $stmt = $conn->prepare('
        SELECT e.id, e.full_name, e.mobile_number, e.email, e.designation, e.department,
               e.state AS emp_state, e.date_of_joining, e.employee_code, e.employee_role,
               e.app_role, e.worker_category, e.profile_pic_url, e.date_of_birth,
               c.name AS client_name, c.client_code,
               u.name AS unit_name, u.city AS unit_city, u.state AS unit_state,
               e.client_id, e.unit_id
        FROM employees e
        LEFT JOIN clients c ON c.id = e.client_id
        LEFT JOIN units u ON u.id = e.unit_id
        WHERE e.mobile_number = ? AND e.status = ?
    ');
    if (!$stmt) {
        jsonOutput(array('success' => false, 'error' => 'Database query error'), 500);
        return;
    }
    $approvedStatus = 'approved';
    $stmt->bind_param('ss', $mobile, $approvedStatus);
    $stmt->execute();
    $result = $stmt->get_result();
    $employee = $result->fetch_assoc();
    $stmt->close();

    if (!$employee) {
        _trackFailedAttempt($rateFile, $rateData);
        jsonOutput(array('success' => false, 'error' => 'Invalid mobile number or PIN'), 401);
        return;
    }

    // ─── PIN Validation ───────────────────────────────────────────────────
    $employeeId = (string)$employee['id'];
    $validPin = false;
    $hasCustomPin = false;

    // Step 1: Check ess_employee_cache for custom PIN
    $cacheStmt = $conn->prepare('SELECT pin FROM ess_employee_cache WHERE employee_id = ?');
    if ($cacheStmt) {
        $cacheStmt->bind_param('s', $employeeId);
        $cacheStmt->execute();
        $cacheRow = $cacheStmt->get_result()->fetch_assoc();
        $cacheStmt->close();

        if ($cacheRow && !empty($cacheRow['pin'])) {
            // Custom PIN exists in cache — validate against it
            $hasCustomPin = true;
            if ($cacheRow['pin'] === $pin) {
                $validPin = true;
            }
        }
    }

    // Step 2: If no custom PIN or custom PIN didn't match, try birth year
    if (!$validPin && !$hasCustomPin && !empty($employee['date_of_birth'])) {
        $birthYear = substr($employee['date_of_birth'], 0, 4);
        if ($birthYear === $pin) {
            $validPin = true;
            // has_custom_pin remains false → will trigger force PIN change
        }
    }

    if (!$validPin) {
        _trackFailedAttempt($rateFile, $rateData);
        jsonOutput(array('success' => false, 'error' => 'Invalid mobile number or PIN'), 401);
        return;
    }

    $role = _determineRole($employee);

    // ─── Update Employee Cache (WITHOUT pin — pin is set only by change-pin endpoint) ──
    $unitName = $employee['unit_name'] ?? '';
    $clientName = $employee['client_name'] ?? '';
    $city = isset($employee['unit_city']) ? $employee['unit_city'] : '';
    $state = isset($employee['unit_state']) ? $employee['unit_state'] : '';
    $profilePicUrl = $employee['profile_pic_url'] ?? '';
    $designation = $employee['designation'] ?? '';
    $employeeCode = (string)($employee['employee_code'] ?? '');
    $clientId = (int)($employee['client_id'] ?? 0);
    $unitId = (int)($employee['unit_id'] ?? 0);

    // Extract all values into local variables first
    $fullName = $employee['full_name'] ?? '';
    $mobileNumber = $employee['mobile_number'] ?? '';

    $cacheStmt = $conn->prepare('
        INSERT INTO ess_employee_cache (
            employee_id, role, unit_id, unit_name, city, state,
            client_name, client_id, full_name, mobile_number,
            designation, profile_pic_url, employee_code
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            employee_code = VALUES(employee_code)
    ');
    if (!$cacheStmt) {
        jsonOutput(array('success' => false, 'error' => 'Failed to update cache'), 500);
        return;
    }

    // Use bindDynamicParams helper (call_user_func_array with references)
    bindDynamicParams($cacheStmt, 'ssissssissssss', array(
        $employeeId, $role, $unitId, $unitName, $city, $state,
        $clientName, $clientId, $fullName, $mobileNumber,
        $designation, $profilePicUrl, $employeeCode
    ));
    $cacheStmt->execute();
    $cacheStmt->close();

    // ─── Generate JWT ─────────────────────────────────────────────────────
    $token = SimpleJWT::encode(array(
        'employee_id' => $employeeId,
        'role' => $role,
        'full_name' => $employee['full_name']
    ), 86400);

    @unlink($rateFile);

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'employee' => array(
                'employee_id' => $employeeId,
                'id' => (int)$employee['id'],
                'full_name' => $employee['full_name'],
                'mobile_number' => $employee['mobile_number'],
                'email' => isset($employee['email']) ? $employee['email'] : '',
                'designation' => $designation,
                'department' => isset($employee['department']) ? $employee['department'] : '',
                'employee_code' => $employeeCode,
                'role' => $role,
                'has_custom_pin' => $hasCustomPin,
                'profile_pic_url' => $profilePicUrl,
                'city' => $city,
                'state' => $state,
                'unit_name' => $unitName,
                'unit_name' => $unitName,
                'client_name' => $clientName,
                'date_of_joining' => isset($employee['date_of_joining']) ? $employee['date_of_joining'] : '',
            ),
            'role' => $role,
            'token' => $token
        )
    ));

} catch (\Throwable $e) {
    jsonOutput(array('success' => false, 'error' => 'Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()), 500);
}

function _trackFailedAttempt($rateFile, $rateData): void
{
    $rateData['attempts']++;
    $rateData['last_attempt'] = time();
    @file_put_contents($rateFile, json_encode($rateData), LOCK_EX);
}

function _determineRole($employee): string
{
    $appRole = strtolower($employee['app_role'] ?? '');
    $employeeRole = strtolower($employee['employee_role'] ?? '');
    $workerCategory = strtolower($employee['worker_category'] ?? '');

    if (in_array($appRole, array('manager', 'regional_manager'))) return $appRole;
    if (in_array($employeeRole, array('admin', 'manager'))) return $employeeRole;
    if (strpos($workerCategory, 'supervisor') !== false) return 'supervisor';
    return 'employee';
}
