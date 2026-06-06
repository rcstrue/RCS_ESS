<?php
/**
 * ESS API — Access Allocation Endpoint
 * GET: Returns the logged-in user's access allocation from payroll system.
 *
 * Reads from the payroll-driven `employee_city_allocations` table where:
 *   allocation_type = 'unit'  → unit-level access (supervisor)
 *   allocation_type = 'city'  → city-level access (manager)
 *
 * Access levels:
 *   admin            → full access (all employees, all cities, all units)
 *   regional_manager → full access
 *   manager          → assigned cities → can view all employees in those cities
 *   supervisor       → assigned units  → can view only employees in those units
 *   employee         → self only
 *
 * Returns:
 *   { success: true, data: { user_id, role, cities: [], units: [], cities_detail: [] } }
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonOutput(array('success' => false, 'error' => 'Method not allowed'), 405);
}

try {
    validateApiKey();
    $employeeId = requireAuth();
    $conn = getDbConnection();

    // ─── Auto-create tables if not exist ──────────────────────────────

    // Cities lookup table
    $conn->query("
        CREATE TABLE IF NOT EXISTS ess_cities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            state VARCHAR(100) DEFAULT '',
            is_active TINYINT(1) DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Seed cities from existing units table
    $conn->query("
        INSERT IGNORE INTO ess_cities (name, state)
        SELECT DISTINCT u.city, COALESCE(u.state, '')
        FROM units u
        WHERE u.city IS NOT NULL AND u.city != '' AND u.is_active = 1
    ");

    // Backfill city_id column on units table
    $colCheck = $conn->query("SHOW COLUMNS FROM units LIKE 'city_id'");
    if ($colCheck->num_rows === 0) {
        $conn->query("ALTER TABLE units ADD COLUMN city_id INT NULL AFTER city");
    }
    $conn->query("
        UPDATE units u
        INNER JOIN ess_cities c ON c.name = u.city
        SET u.city_id = c.id
        WHERE u.city_id IS NULL AND u.city IS NOT NULL AND u.city != ''
    ");

    // ─── Auto-create payroll allocation table if not exists ──────────
    $conn->query("
        CREATE TABLE IF NOT EXISTS employee_city_allocations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            allocation_type VARCHAR(50) NOT NULL DEFAULT 'unit',
            allocation_value VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_employee (employee_id),
            INDEX idx_type (allocation_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // ─── Get user's base role from employee_cache ─────────────────────
    $cacheStmt = $conn->prepare('SELECT role, unit_id, client_id FROM ess_employee_cache WHERE employee_id = ?');
    $cacheStmt->bind_param('s', $employeeId);
    $cacheStmt->execute();
    $cacheRow = $cacheStmt->get_result()->fetch_assoc();
    $cacheStmt->close();

    $baseRole = $cacheRow ? $cacheRow['role'] : 'employee';

    // ─── Admin / Regional Manager → full access immediately ───────────
    if ($baseRole === 'admin' || $baseRole === 'regional_manager') {
        jsonOutput(array(
            'success' => true,
            'data' => array(
                'user_id' => (int)$employeeId,
                'role' => $baseRole,
                'cities' => array(),
                'units' => array(),
                'cities_detail' => array(),
            )
        ));
        return;
    }

    // ─── Read payroll allocations from employee_city_allocations ──────
    $allocStmt = $conn->prepare('
        SELECT allocation_type, allocation_value
        FROM employee_city_allocations
        WHERE employee_id = ?
    ');
    $allocStmt->bind_param('s', $employeeId);
    $allocStmt->execute();
    $allocResult = $allocStmt->get_result();

    $cityNames = array();
    $unitNames = array();
    while ($row = $allocResult->fetch_assoc()) {
        $type = strtolower(trim($row['allocation_type']));
        $value = trim($row['allocation_value']);
        if ($type === 'city' && $value !== '') {
            $cityNames[] = $value;
        } elseif ($type === 'unit' && $value !== '') {
            $unitNames[] = $value;
        }
    }
    $allocStmt->close();

    // ─── Convert unit names → unit IDs ─────────────────────────────────
    $unitIds = array();
    if (!empty($unitNames)) {
        $placeholders = implode(',', array_fill(0, count($unitNames), '?'));
        $unitStmt = $conn->prepare("SELECT id FROM units WHERE name IN ($placeholders) AND is_active = 1");
        $types = str_repeat('s', count($unitNames));
        bindDynamicParams($unitStmt, $types, $unitNames);
        $unitStmt->execute();
        $unitResult = $unitStmt->get_result();
        while ($row = $unitResult->fetch_assoc()) {
            $unitIds[] = (int)$row['id'];
        }
        $unitStmt->close();
    }

    // ─── Convert city names → city IDs ─────────────────────────────────
    $cityIds = array();
    if (!empty($cityNames)) {
        $placeholders = implode(',', array_fill(0, count($cityNames), '?'));
        $cityStmt = $conn->prepare("SELECT id FROM ess_cities WHERE name IN ($placeholders) AND is_active = 1");
        $types = str_repeat('s', count($cityNames));
        bindDynamicParams($cityStmt, $types, $cityNames);
        $cityStmt->execute();
        $cityResult = $cityStmt->get_result();
        while ($row = $cityResult->fetch_assoc()) {
            $cityIds[] = (int)$row['id'];
        }
        $cityStmt->close();
    }

    // ─── Also get city IDs from units (units → cities mapping) ────────
    // If user has unit allocations, we can derive their city IDs from those units
    $cityIdsFromUnits = array();
    if (!empty($unitIds)) {
        $placeholders = implode(',', array_fill(0, count($unitIds), '?'));
        $cityFromUnitStmt = $conn->prepare("
            SELECT DISTINCT u.city_id, c.id, c.name, c.state
            FROM units u
            LEFT JOIN ess_cities c ON c.id = u.city_id
            WHERE u.id IN ($placeholders) AND u.city_id IS NOT NULL
        ");
        $types = str_repeat('i', count($unitIds));
        bindDynamicParams($cityFromUnitStmt, $types, $unitIds);
        $cityFromUnitStmt->execute();
        $cityFromUnitResult = $cityFromUnitStmt->get_result();
        while ($row = $cityFromUnitResult->fetch_assoc()) {
            $cid = (int)$row['id'];
            if ($cid && !in_array($cid, $cityIds)) {
                $cityIds[] = $cid;
            }
        }
        $cityFromUnitStmt->close();
    }

    // ─── Determine effective role ──────────────────────────────────────
    $role = $baseRole;
    if (!empty($cityNames) && !empty($unitNames)) {
        // Has both city and unit allocations → treat as manager (broader access)
        $role = 'manager';
    } elseif (!empty($cityNames)) {
        // City allocations only → manager
        $role = 'manager';
    } elseif (!empty($unitNames)) {
        // Unit allocations only → supervisor
        $role = 'supervisor';
    }
    // else: no allocations → keep base role (employee or whatever cache says)

    // ─── Fetch city details for frontend display ──────────────────────
    $citiesDetail = array();
    if (!empty($cityIds)) {
        $placeholders = implode(',', array_fill(0, count($cityIds), '?'));
        $cityDetailStmt = $conn->prepare("
            SELECT id, name, state
            FROM ess_cities
            WHERE id IN ($placeholders) AND is_active = 1
            ORDER BY name
        ");
        $types = str_repeat('i', count($cityIds));
        bindDynamicParams($cityDetailStmt, $types, $cityIds);
        $cityDetailStmt->execute();
        $cityDetailResult = $cityDetailStmt->get_result();
        while ($row = $cityDetailResult->fetch_assoc()) {
            $citiesDetail[] = array(
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'state' => $row['state'] ?? '',
            );
        }
        $cityDetailStmt->close();
    }

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'user_id' => (int)$employeeId,
            'role' => $role,
            'cities' => $cityIds,
            'units' => $unitIds,
            'cities_detail' => $citiesDetail,
        )
    ));

} catch (\Throwable $e) {
    jsonOutput(array('success' => false, 'error' => 'Server error: ' . $e->getMessage()), 500);
}
