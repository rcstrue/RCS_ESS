<?php
/**
 * ESS API — Access Allocation Endpoint
 * GET: Returns the logged-in user's access allocation from HRMS Payroll System.
 *
 * PRIMARY SOURCE: `user_access` table (indexed by employee_code)
 * FALLBACK:      `employee_city_allocations` table (backward compatible)
 *
 * Role system (from employees.app_role):
 *   manager → allocated units  → sees employees in those units
 *   employee → self only (no directory)
 *
 * HK Supervisor / Forklift auto-assign:
 *   If designation contains "HK Supervisor" or "Forklift Driver",
 *   their own unit is auto-inserted into user_access (cannot be removed).
 *
 * Returns:
 *   { success: true, data: { user_id, role, cities: [], units: [] } }
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonOutput(array('success' => false, 'error' => 'Method not allowed'), 405);
}

try {
    validateApiKey();
    $employeeId = requireAuth(); // numeric employee ID from JWT
    $conn = getDbConnection();

    // ─── Ensure user_access table exists ──────────────────────────────
    $conn->query("
        CREATE TABLE IF NOT EXISTS user_access (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            access_type ENUM('city','unit') NOT NULL,
            access_id VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY (user_id, access_type, access_id),
            KEY idx_user (user_id),
            KEY idx_type (access_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // ─── Get employee_code and app_role ───────────────────────────────
    // Look up from ess_employee_cache (fast, already has employee_code)
    $cacheStmt = $conn->prepare('SELECT employee_code, role AS cache_role, unit_id FROM ess_employee_cache WHERE employee_id = ?');
    $cacheStmt->bind_param('s', $employeeId);
    $cacheStmt->execute();
    $cacheRow = $cacheStmt->get_result()->fetch_assoc();
    $cacheStmt->close();

    // Also get app_role and employee_role from the employees table (authoritative)
    $empStmt = $conn->prepare('SELECT app_role, employee_role, designation, unit_id, worker_category FROM employees WHERE id = ?');
    $intId = (int)$employeeId;
    $empStmt->bind_param('i', $intId);
    $empStmt->execute();
    $empRow = $empStmt->get_result()->fetch_assoc();
    $empStmt->close();

    $employeeCode = '';
    $ownUnitId = null;
    $ownUnitName = '';

    if ($cacheRow) {
        $employeeCode = $cacheRow['employee_code'] ?? '';
        $ownUnitId = !empty($cacheRow['unit_id']) ? (int)$cacheRow['unit_id'] : null;
    }
    if ($empRow) {
        if (!$employeeCode) {
            $employeeCode = (string)($empRow['employee_code'] ?? '');
        }
        if (!$ownUnitId && !empty($empRow['unit_id'])) {
            $ownUnitId = (int)$empRow['unit_id'];
        }
    }

    // ─── Determine authoritative role ──────────────────────────────────
    // Priority: employees.app_role > employees.employee_role > cache.role
    $appRole = strtolower(trim($empRow['app_role'] ?? ''));
    $employeeRole = strtolower(trim($empRow['employee_role'] ?? ''));
    $designation = strtolower(trim($empRow['designation'] ?? ''));

    // Admin (employee_role in HRMS) → full access immediately
    if ($employeeRole === 'admin') {
        jsonOutput(array(
            'success' => true,
            'data' => array(
                'user_id' => (int)$employeeId,
                'employee_code' => $employeeCode,
                'role' => 'admin',
                'cities' => array(),
                'units' => array(),
            )
        ));
        return;
    }

    // ─── Read allocations from user_access (PRIMARY) — unit rows only ───
    $unitNames = array();
    $hasUserAccess = false;

    if (!empty($employeeCode)) {
        $uaStmt = $conn->prepare('SELECT access_type, access_id FROM user_access WHERE user_id = ?');
        $uaStmt->bind_param('s', $employeeCode);
        $uaStmt->execute();
        $uaResult = $uaStmt->get_result();
        while ($row = $uaResult->fetch_assoc()) {
            $type = strtolower(trim($row['access_type']));
            $value = trim($row['access_id']);
            // Only collect unit-type rows; ignore city rows
            if ($type === 'unit' && $value !== '') {
                $unitNames[] = $value;
                $hasUserAccess = true;
            }
        }
        $uaStmt->close();
    }

    // ─── Fallback: read from employee_city_allocations (legacy) — unit only ──
    if (!$hasUserAccess) {
        $legacyStmt = $conn->prepare('
            SELECT allocation_type, allocation_value
            FROM employee_city_allocations
            WHERE employee_id = ?
        ');
        $legacyStmt->bind_param('s', $employeeId);
        $legacyStmt->execute();
        $legacyResult = $legacyStmt->get_result();
        while ($row = $legacyResult->fetch_assoc()) {
            $type = strtolower(trim($row['allocation_type']));
            $value = trim($row['allocation_value']);
            // Only collect unit-type rows; ignore city rows
            if ($type === 'unit' && $value !== '') {
                $unitNames[] = $value;
            }
        }
        $legacyStmt->close();
    }

    // ─── Convert unit names → unit IDs ────────────────────────────────
    $unitIds = array();
    if (!empty($unitNames)) {
        $placeholders = implode(',', array_fill(0, count($unitNames), '?'));
        $unitStmt = $conn->prepare("SELECT id, name FROM units WHERE name IN ($placeholders) AND is_active = 1");
        $types = str_repeat('s', count($unitNames));
        bindDynamicParams($unitStmt, $types, $unitNames);
        $unitStmt->execute();
        $unitResult = $unitStmt->get_result();
        while ($row = $unitResult->fetch_assoc()) {
            $unitIds[] = (int)$row['id'];
        }
        $unitStmt->close();
    }

    // ─── HK Supervisor / Forklift auto-assign fallback ─────────────
    // If no allocations found but designation matches, auto-use own unit
    if (empty($unitIds) && $ownUnitId) {
        $isAutoAssign = (strpos($designation, 'hk supervisor') !== false
                      || strpos($designation, 'forklift driver') !== false
                      || strpos($designation, 'fork lift driver') !== false);
        if ($isAutoAssign) {
            $unitIds = array($ownUnitId);
        }
    }

    // ─── Fallback: use own unit for any manager with no allocations ──
    if (empty($unitIds) && $ownUnitId && ($appRole === 'manager')) {
        $unitIds = array($ownUnitId);
    }

    // ─── Determine effective role ──────────────────────────────────────
    // Unit allocations → manager; otherwise → employee
    if ($appRole === 'manager' || $appRole === 'field_officer') {
        $role = 'manager';
    } elseif (!empty($unitNames)) {
        $role = 'manager';
    } else {
        $role = 'employee';
    }

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'user_id' => (int)$employeeId,
            'employee_code' => $employeeCode,
            'role' => $role,
            'cities' => array(),
            'units' => $unitIds,
        )
    ));

} catch (\Throwable $e) {
    jsonOutput(array('success' => false, 'error' => 'Server error: ' . $e->getMessage()), 500);
}
