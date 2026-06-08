<?php
/**
 * ESS API — Employee Directory Endpoint
 * GET: Search/filter employees with access allocation filtering
 *
 * Filtering:
 *   - unit_ids  → filter by e.unit_id (from user_access table)
 *   - When NONE provided → show all approved (admin)
 *
 * Params: scope, q, client_id, unit_id, department, unit_ids,
 *         page, limit
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
    $search = trim($_GET['q'] ?? '');
    $clientId = $_GET['client_id'] ?? '';
    $unitId = $_GET['unit_id'] ?? '';
    $department = $_GET['department'] ?? '';
    list($page, $limit, $offset) = getPaginationParams();

    // Access allocation params (sent from frontend useAccess hook)
    $unitIds = isset($_GET['unit_ids']) ? array_map('intval', explode(',', $_GET['unit_ids'])) : array();
    // Filter out zeros
    $unitIds = array_values(array_filter($unitIds, function($v) { return $v > 0; }));

    // ─── Build Base Query ─────────────────────────────────────────────────
    $whereClause = 'WHERE e.status = ?';
    $types = 's';
    $params = array('approved');

    // ─── Access allocation filtering (payroll-driven) ───────────────
    $hasAccessAllocation = false;

    if (!empty($unitIds)) {
        $unitPlaceholders = implode(',', array_fill(0, count($unitIds), '?'));
        $whereClause .= " AND e.unit_id IN ($unitPlaceholders)";
        $types .= str_repeat('i', count($unitIds));
        $params = array_merge($params, $unitIds);
        $hasAccessAllocation = true;
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

    // ─── Build JOIN clause (always join units for unit_name/city display) ──
    $joinClause = 'LEFT JOIN clients c ON c.id = e.client_id LEFT JOIN units u ON u.id = e.unit_id';

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
        {$joinClause}
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
