<?php
/**
 * ESS API — Employee Directory Endpoint
 * GET: Search/filter employees with role-based access control
 *
 * Worker category exclusion (from HRMS payroll rules):
 *   - Always exclude: Semi-Skilled, Unskilled
 *
 * Access allocation filtering (from user_access table):
 *   - unit_ids  → filter by e.unit_id (manager/supervisor with unit allocations)
 *   - city_ids  → filter by u.city_id (regional_manager with city allocations)
 *   - When BOTH are provided → use OR (union of access)
 *   - When NONE are provided → show all approved (admin/legacy)
 *
 * Params: scope, q, client_id, unit_id, department, city_ids, unit_ids,
 *         role_filter, page, limit
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonOutput(array('success' => false, 'error' => 'Method not allowed. Use GET.'), 405);
}

try {
    validateApiKey();

    $employeeId = requireAuth();
    $conn = getDbConnection();

    $scope = $_GET['scope'] ?? 'all';
    $roleFilter = $_GET['role_filter'] ?? 'all';
    $search = trim($_GET['q'] ?? '');
    $clientId = $_GET['client_id'] ?? '';
    $unitId = $_GET['unit_id'] ?? '';
    $department = $_GET['department'] ?? '';
    list($page, $limit, $offset) = getPaginationParams();

    // Access allocation params (sent from frontend useAccess hook)
    $cityIds = isset($_GET['city_ids']) ? array_map('intval', explode(',', $_GET['city_ids'])) : array();
    $unitIds = isset($_GET['unit_ids']) ? array_map('intval', explode(',', $_GET['unit_ids'])) : array();
    // Filter out zeros
    $cityIds = array_values(array_filter($cityIds, function($v) { return $v > 0; }));
    $unitIds = array_values(array_filter($unitIds, function($v) { return $v > 0; }));

    // ─── Build Base Query ─────────────────────────────────────────────────
    $whereClause = 'WHERE e.status = ?';
    $types = 's';
    $params = array('approved');

    // Worker category exclusion (from HRMS payroll rules)
    // Always exclude: Semi-Skilled, Unskilled
    // Always include: Skilled, Supervisor, and all other categories
    $whereClause .= " AND (e.worker_category IS NULL OR e.worker_category NOT IN ('Semi-Skilled', 'Unskilled'))";

    // Role-based filtering (all, managers, admin)
    if ($roleFilter === 'managers') {
        $whereClause .= " AND (e.employee_role IN ('manager') OR e.app_role IN ('manager', 'regional_manager'))";
    } elseif ($roleFilter === 'admin') {
        $whereClause .= " AND e.employee_role = 'admin'";
    }

    // ─── Access allocation filtering (payroll-driven) ───────────────
    // Build access filter clause separately — may need JOIN
    $accessFilter = '';
    $accessTypes = '';
    $accessParams = array();
    $needsUnitsJoin = false;
    $hasAccessAllocation = false;  // flag: skip legacy scope filter when access allocation is provided

    if (!empty($cityIds)) {
        $needsUnitsJoin = true;
        $cityPlaceholders = implode(',', array_fill(0, count($cityIds), '?'));
        $accessFilter .= "u.city_id IN ($cityPlaceholders)";
        $accessTypes .= str_repeat('i', count($cityIds));
        $accessParams = array_merge($accessParams, $cityIds);
    }

    if (!empty($unitIds)) {
        if (!empty($accessFilter)) {
            // Both city and unit access → use OR (union of both access scopes)
            $accessFilter .= ' OR ';
        }
        $unitPlaceholders = implode(',', array_fill(0, count($unitIds), '?'));
        $accessFilter .= "e.unit_id IN ($unitPlaceholders)";
        $accessTypes .= str_repeat('i', count($unitIds));
        $accessParams = array_merge($accessParams, $unitIds);
    }

    // Apply access filter
    if (!empty($accessFilter)) {
        $whereClause .= " AND ({$accessFilter})";
        $types .= $accessTypes;
        $params = array_merge($params, $accessParams);
        $hasAccessAllocation = true;
    }

    // Scope-based filtering (legacy fallback — SKIP when access allocation is provided)
    if ($hasAccessAllocation) {
        // Access allocation already handles filtering — skip legacy scope logic
    } elseif ($scope === 'team') {
        $cacheStmt = $conn->prepare('SELECT unit_id, client_id FROM ess_employee_cache WHERE employee_id = ?');
        if (!$cacheStmt) {
            jsonOutput(array('success' => false, 'error' => 'Database error'), 500);
            return;
        }
        $cacheStmt->bind_param('s', $employeeId);
        $cacheStmt->execute();
        $cacheData = $cacheStmt->get_result()->fetch_assoc();
        $cacheStmt->close();

        if ($cacheData) {
            $teamWhere = '';
            $teamTypes = '';
            $teamParams = array();

            if (!empty($cacheData['unit_id'])) {
                $teamWhere .= 'e.unit_id = ?';
                $teamTypes .= 'i';
                $teamParams[] = (int)$cacheData['unit_id'];
            }
            if (!empty($cacheData['client_id'])) {
                if (!empty($teamWhere)) $teamWhere .= ' OR ';
                $teamWhere .= 'e.client_id = ?';
                $teamTypes .= 'i';
                $teamParams[] = (int)$cacheData['client_id'];
            }

            if (!empty($teamWhere)) {
                $whereClause .= " AND ({$teamWhere})";
                $types .= $teamTypes;
                $params = array_merge($params, $teamParams);
            }
        }
    } elseif ($scope === 'unit') {
        if (empty($unitId)) {
            $cacheStmt = $conn->prepare('SELECT unit_id FROM ess_employee_cache WHERE employee_id = ?');
            if (!$cacheStmt) {
                jsonOutput(array('success' => false, 'error' => 'Database error'), 500);
                return;
            }
            $cacheStmt->bind_param('s', $employeeId);
            $cacheStmt->execute();
            $cacheData = $cacheStmt->get_result()->fetch_assoc();
            $cacheStmt->close();
            if (!empty($cacheData['unit_id'])) {
                $whereClause .= ' AND e.unit_id = ?';
                $types .= 'i';
                $params[] = (int)$cacheData['unit_id'];
            }
        } else {
            $whereClause .= ' AND e.unit_id = ?';
            $types .= 'i';
            $params[] = (int)$unitId;
        }
    }

    if (!empty($search)) {
        $whereClause .= ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.mobile_number LIKE ? OR e.designation LIKE ?)';
        $types .= 'ssss';
        $searchTerm = '%' . $search . '%';
        $params = array_merge($params, array($searchTerm, $searchTerm, $searchTerm, $searchTerm));
    }
    if (!empty($clientId)) {
        $whereClause .= ' AND e.client_id = ?';
        $types .= 'i';
        $params[] = (int)$clientId;
    }
    if (!empty($unitId)) {
        $whereClause .= ' AND e.unit_id = ?';
        $types .= 'i';
        $params[] = (int)$unitId;
    }
    if (!empty($department)) {
        $whereClause .= ' AND e.department = ?';
        $types .= 's';
        $params[] = $department;
    }

    // ─── Build JOIN clause ───────────────────────────────────────────
    $joinClause = 'LEFT JOIN clients c ON c.id = e.client_id';
    if ($needsUnitsJoin) {
        $joinClause .= ' LEFT JOIN units u ON u.id = e.unit_id';
    }

    // ─── Count ───────────────────────────────────────────────────────────
    $countQuery = "SELECT COUNT(*) AS total FROM employees e {$joinClause} {$whereClause}";
    $countStmt = $conn->prepare($countQuery);
    if (!$countStmt) {
        jsonOutput(array('success' => false, 'error' => 'Database query error: ' . $conn->error), 500);
        return;
    }
    bindDynamicParams($countStmt, $types, $params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // ─── Data Query ─────────────────────────────────────────────────────
    // Always join units for unit_name/city display
    $dataJoin = $joinClause;
    if (!$needsUnitsJoin) {
        $dataJoin .= ' LEFT JOIN units u ON u.id = e.unit_id';
    }

    $dataQuery = "
        SELECT
            e.id AS emp_id, e.full_name, e.mobile_number, e.email,
            e.designation, e.department, e.employee_code, e.profile_pic_url,
            e.state AS emp_state, e.date_of_joining, e.employee_role, e.app_role,
            e.status AS emp_status, e.unit_id AS emp_unit_id,
            c.name AS client_name, c.id AS emp_client_id,
            u.name AS unit_name,
            u.city AS emp_city
        FROM employees e
        {$dataJoin}
        {$whereClause}
        ORDER BY e.full_name ASC
        LIMIT ? OFFSET ?
    ";
    $dataTypes = $types . 'ii';
    $dataParams = $params;
    $dataParams[] = $limit;
    $dataParams[] = $offset;

    $stmt = $conn->prepare($dataQuery);
    if (!$stmt) {
        jsonOutput(array('success' => false, 'error' => 'Database query error: ' . $conn->error), 500);
        return;
    }
    bindDynamicParams($stmt, $dataTypes, $dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $employees = array();
    while ($row = $result->fetch_assoc()) {
        $employees[] = array(
            'employee_id' => (string)$row['emp_id'],
            'id' => (int)$row['emp_id'],
            'full_name' => $row['full_name'],
            'mobile_number' => $row['mobile_number'],
            'email' => isset($row['email']) ? $row['email'] : '',
            'designation' => isset($row['designation']) ? $row['designation'] : '',
            'department' => isset($row['department']) ? $row['department'] : '',
            'employee_code' => isset($row['employee_code']) ? $row['employee_code'] : '',
            'profile_pic_url' => isset($row['profile_pic_url']) ? $row['profile_pic_url'] : '',
            'city' => isset($row['emp_city']) ? $row['emp_city'] : '',
            'state' => isset($row['emp_state']) ? $row['emp_state'] : '',
            'date_of_joining' => isset($row['date_of_joining']) ? $row['date_of_joining'] : '',
            'employee_role' => isset($row['employee_role']) ? $row['employee_role'] : '',
            'app_role' => isset($row['app_role']) ? $row['app_role'] : '',
            'status' => isset($row['emp_status']) ? $row['emp_status'] : '',
            'client_name' => isset($row['client_name']) ? $row['client_name'] : '',
            'unit_name' => isset($row['unit_name']) ? $row['unit_name'] : '',
            'client_id' => isset($row['emp_client_id']) ? (int)$row['emp_client_id'] : 0,
            'unit_id' => isset($row['emp_unit_id']) ? (int)$row['emp_unit_id'] : 0,
        );
    }
    $stmt->close();

    jsonOutput(array(
        'success' => true,
        'data' => array_merge(
            array('items' => $employees),
            buildPagination($total, $page, $limit)
        )
    ));

} catch (\Throwable $e) {
    jsonOutput(array('success' => false, 'error' => 'Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()), 500);
}
