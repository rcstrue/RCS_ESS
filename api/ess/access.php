<?php
/**
 * ESS API — Access Allocation Endpoint
 * GET: Returns the logged-in user's access allocation from payroll system.
 *
 * Access levels:
 *   admin            → full access (all employees, all cities, all units)
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

    // ─── Auto-create table if not exists ──────────────────────────────
    $conn->query("
        CREATE TABLE IF NOT EXISTS ess_access_allocations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'employee',
            cities JSON NOT NULL CHECK (JSON_VALID(cities)),
            units JSON NOT NULL CHECK (JSON_VALID(units)),
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_employee (employee_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // ─── Auto-create cities table if not exists ───────────────────────
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

    // ─── Seed cities from existing units table ───────────────────────
    $seedStmt = $conn->query("
        INSERT IGNORE INTO ess_cities (name, state)
        SELECT DISTINCT u.city, COALESCE(u.state, '')
        FROM units u
        WHERE u.city IS NOT NULL AND u.city != '' AND u.is_active = 1
    ");

    // ─── Backfill city_id column on units table ──────────────────────
    // Add city_id column if it doesn't exist
    $colCheck = $conn->query("SHOW COLUMNS FROM units LIKE 'city_id'");
    if ($colCheck->num_rows === 0) {
        $conn->query("ALTER TABLE units ADD COLUMN city_id INT NULL AFTER city");
    }

    // Link units to cities by name
    $conn->query("
        UPDATE units u
        INNER JOIN ess_cities c ON c.name = u.city
        SET u.city_id = c.id
        WHERE u.city_id IS NULL AND u.city IS NOT NULL AND u.city != ''
    ");

    // ─── Get user's role from employee_cache ──────────────────────────
    $cacheStmt = $conn->prepare('SELECT role FROM ess_employee_cache WHERE employee_id = ?');
    $cacheStmt->bind_param('s', $employeeId);
    $cacheStmt->execute();
    $cacheRow = $cacheStmt->get_result()->fetch_assoc();
    $cacheStmt->close();

    $role = $cacheRow ? $cacheRow['role'] : 'employee';

    // ─── Check for explicit access allocation ─────────────────────────
    $accessStmt = $conn->prepare('SELECT role, cities, units FROM ess_access_allocations WHERE employee_id = ?');
    $accessStmt->bind_param('s', $employeeId);
    $accessStmt->execute();
    $accessRow = $accessStmt->get_result()->fetch_assoc();
    $accessStmt->close();

    $cities = array();
    $units = array();

    if ($accessRow) {
        // Explicit allocation from payroll exists
        $role = $accessRow['role']; // Use payroll-assigned role
        $cities = json_decode($accessRow['cities'], true) ?: array();
        $units = json_decode($accessRow['units'], true) ?: array();
    } else {
        // No explicit allocation — derive from employee's own assignment
        if ($role === 'admin' || $role === 'regional_manager') {
            // Full access — cities and units stay empty (means "all")
        } elseif ($role === 'manager' || $role === 'field_officer') {
            // Manager — give access to their own city
            $empStmt = $conn->prepare('SELECT u.city_id FROM ess_employee_cache ec JOIN units u ON u.id = ec.unit_id WHERE ec.employee_id = ?');
            $empStmt->bind_param('s', $employeeId);
            $empStmt->execute();
            $empRow = $empStmt->get_result()->fetch_assoc();
            $empStmt->close();
            if ($empRow && $empRow['city_id']) {
                $cities = array((int)$empRow['city_id']);
            }
        } elseif ($role === 'supervisor') {
            // Supervisor — give access to their own unit
            $empStmt = $conn->prepare('SELECT unit_id FROM ess_employee_cache WHERE employee_id = ?');
            $empStmt->bind_param('s', $employeeId);
            $empStmt->execute();
            $empRow = $empStmt->get_result()->fetch_assoc();
            $empStmt->close();
            if ($empRow && $empRow['unit_id']) {
                $units = array((int)$empRow['unit_id']);
            }
        }
        // employee role → cities and units stay empty (means "self only")
    }

    // ─── Fetch city details (name, state) for assigned cities ────────
    $citiesDetail = array();
    if (!empty($cities) && $role !== 'admin' && $role !== 'regional_manager') {
        $placeholders = implode(',', array_fill(0, count($cities), '?'));
        $cityStmt = $conn->prepare("SELECT id, name, state FROM ess_cities WHERE id IN ($placeholders) AND is_active = 1 ORDER BY name");
        $types = str_repeat('i', count($cities));
        bindDynamicParams($cityStmt, $types, $cities);
        $cityStmt->execute();
        $cityResult = $cityStmt->get_result();
        while ($row = $cityResult->fetch_assoc()) {
            $citiesDetail[] = array(
                'id' => (int)$row['id'],
                'name' => $row['name'],
                'state' => $row['state'] ?? '',
            );
        }
        $cityStmt->close();
    }

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'user_id' => (int)$employeeId,
            'role' => $role,
            'cities' => array_map('intval', $cities),
            'units' => array_map('intval', $units),
            'cities_detail' => $citiesDetail,
        )
    ));

} catch (\Throwable $e) {
    jsonOutput(array('success' => false, 'error' => 'Server error: ' . $e->getMessage()), 500);
}
