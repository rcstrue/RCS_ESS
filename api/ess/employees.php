<?php
/**
 * ESS API — Employee Directory Endpoint
 * GET: Search/filter employees
 *   scope: team (same unit/client), unit, all
 *   q: search query (name, code, mobile)
 *   client_id, unit_id: filter by client/unit
 *   page, limit: pagination
 */

require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonOutput(['success' => false, 'error' => 'Method not allowed. Use GET.'], 405);
}

try {
    validateApiKey();

    $employeeId = requireAuth();
    $conn = getDbConnection();

    // Query params
    $scope = $_GET['scope'] ?? 'all';
    $search = trim($_GET['q'] ?? '');
    $clientId = $_GET['client_id'] ?? '';
    $unitId = $_GET['unit_id'] ?? '';
    $department = $_GET['department'] ?? '';
    [$page, $limit, $offset] = getPaginationParams();

    // ─── Build Base Query ─────────────────────────────────────────────────
    $whereClause = 'WHERE e.status = ?';
    $types = 's';
    $params = [$approvedStatus = 'approved'];

    // Scope-based filtering
    switch ($scope) {
        case 'team':
            // Find employee's unit and client from cache
            $cacheStmt = $conn->prepare('
                SELECT unit_id, client_id, city, state FROM ess_employee_cache WHERE employee_id = ?
            ');
            $cacheStmt->bind_param('s', $employeeId);
            $cacheStmt->execute();
            $cacheData = $cacheStmt->get_result()->fetch_assoc();
            $cacheStmt->close();

            if ($cacheData) {
                // Build OR conditions for team scope
                $teamWhere = '';
                $teamTypes = '';
                $teamParams = [];

                if (!empty($cacheData['unit_id'])) {
                    $teamWhere .= 'e.unit_id = ?';
                    $teamTypes .= 'i';
                    $teamParams[] = (int)$cacheData['unit_id'];
                }

                if (!empty($cacheData['client_id'])) {
                    if (!empty($teamWhere)) {
                        $teamWhere .= ' OR ';
                    }
                    $teamWhere .= 'e.client_id = ?';
                    $teamTypes .= 'i';
                    $teamParams[] = (int)$cacheData['client_id'];
                }

                if (!empty($cacheData['city'])) {
                    if (!empty($teamWhere)) {
                        $teamWhere .= ' OR ';
                    }
                    $teamWhere .= 'e.district = ?';
                    $teamTypes .= 's';
                    $teamParams[] = $cacheData['city'];
                }

                if (!empty($teamWhere)) {
                    $whereClause .= " AND ({$teamWhere})";
                    $types .= $teamTypes;
                    $params = array_merge($params, $teamParams);
                }
            }
            break;

        case 'unit':
            // Only show employees in same unit
            if (empty($unitId)) {
                // Get current employee's unit
                $cacheStmt = $conn->prepare('SELECT unit_id FROM ess_employee_cache WHERE employee_id = ?');
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
            break;

        case 'all':
        default:
            // No additional scope restrictions
            break;
    }

    // Additional filters
    if (!empty($search)) {
        $whereClause .= ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.mobile_number LIKE ? OR e.designation LIKE ?)';
        $types .= 'ssss';
        $searchTerm = '%' . $search . '%';
        $params = array_merge($params, [$searchTerm, $searchTerm, $searchTerm, $searchTerm]);
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

    // ─── Count Query ──────────────────────────────────────────────────────
    $countQuery = "SELECT COUNT(*) AS total FROM employees e {$whereClause}";
    $countStmt = $conn->prepare($countQuery);
    if (!empty($params)) {
        $countStmt->bind_param($types, ...$params);
    }
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // ─── Data Query with JOINs (table aliases for ALL columns) ────────────
    $dataQuery = "
        SELECT
            e.id AS emp_id,
            e.full_name,
            e.mobile_number,
            e.email,
            e.designation,
            e.department,
            e.employee_code,
            e.profile_pic_url,
            e.district AS emp_city,
            e.state AS emp_state,
            e.date_of_joining,
            e.employee_role,
            e.app_role,
            e.status AS emp_status,
            c.name AS client_name,
            u.name AS unit_name
        FROM employees e
        LEFT JOIN clients c ON c.id = e.client_id AND c.is_active = 1
        LEFT JOIN units u ON u.id = e.unit_id AND u.is_active = 1
        {$whereClause}
        ORDER BY e.full_name ASC
        LIMIT ? OFFSET ?
    ";

    $dataTypes = $types . 'ii';
    $dataParams = array_merge($params, [$limit, $offset]);

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $employees = [];
    while ($row = $result->fetch_assoc()) {
        $employees[] = [
            'employee_id' => (string)$row['emp_id'],
            'full_name' => $row['full_name'],
            'mobile_number' => $row['mobile_number'],
            'email' => $row['email'] ?? '',
            'designation' => $row['designation'] ?? '',
            'department' => $row['department'] ?? '',
            'employee_code' => $row['employee_code'] ?? '',
            'profile_pic_url' => $row['profile_pic_url'] ?? '',
            'city' => $row['emp_city'] ?? '',
            'state' => $row['emp_state'] ?? '',
            'date_of_joining' => $row['date_of_joining'] ?? '',
            'employee_role' => $row['employee_role'] ?? '',
            'app_role' => $row['app_role'] ?? '',
            'status' => $row['emp_status'] ?? '',
            'client_name' => $row['client_name'] ?? '',
            'unit_name' => $row['unit_name'] ?? '',
        ];
    }
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $employees,
            ...buildPagination($total, $page, $limit)
        ]
    ]);

} catch (Throwable $e) {
    essLog('FATAL employees: ' . $e->getMessage());
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}
