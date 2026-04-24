<?php
/**
 * RCS ESS - Employees Directory API
 * GET: List/search employees
 *
 * DB Schema:
 * - employees table: id is int, status is enum, NO city column (has state, district)
 * - units table: has city and state columns
 * - For scope=city: filter employees by the requesting employee's unit city
 */

@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    jsonError('Method not allowed. Use GET.', 405);
}

$scope       = getQueryParam('scope');
$requesterId = getQueryParam('requester_id');
$q           = getQueryParam('q');
$clientId    = getQueryParam('client_id');
$unitId      = getQueryParam('unit_id');
$status      = getQueryParam('status', 'approved');

$where  = ['e.status = ?'];
$params = [$status];
$types  = 's';

// Handle city scope: filter employees by the requesting employee's unit city
if ($scope === 'city' && $requesterId) {
    $reqId = intval($requesterId);
    // Get the requesting employee's unit city
    $cityStmt = $conn->prepare("SELECT u.city FROM employees e LEFT JOIN units u ON e.unit_id = u.id WHERE e.id = ? LIMIT 1");
    safeBindParam($cityStmt, 'i', [$reqId]);
    $cityStmt->execute();
    $cityResult = $cityStmt->get_result();
    $cityRow = $cityResult->fetch_assoc();
    $cityResult->free();
    $cityStmt->close();

    if ($cityRow && $cityRow['city']) {
        // Find all unit IDs in the same city
        $where[] = 'e.unit_id IN (SELECT id FROM units WHERE city = ?)';
        $params[] = $cityRow['city'];
        $types .= 's';
    }
}

if ($q) {
    $searchTerm = '%' . $q . '%';
    $where[] = '(e.full_name LIKE ? OR e.employee_code LIKE ? OR e.mobile_number LIKE ?)';
    $params[] = $searchTerm;
    $params[] = $searchTerm;
    $params[] = $searchTerm;
    $types .= 'sss';
}

if ($clientId) {
    $where[] = 'e.client_id = ?';
    $params[] = intval($clientId);
    $types .= 'i';
}

if ($unitId) {
    $where[] = 'e.unit_id = ?';
    $params[] = intval($unitId);
    $types .= 'i';
}

$whereClause = implode(' AND ', $where);
$pag = getPaginationParams();

$countSql = "SELECT COUNT(*) as total FROM employees e WHERE {$whereClause}";
$dataSql  = "SELECT e.id, e.employee_code, e.full_name, e.father_name, e.mobile_number, e.email,
                    e.designation, e.department, e.employee_role, e.worker_category, e.employment_type,
                    e.client_id, e.unit_id, e.date_of_joining, e.profile_pic_url, e.profile_completion, e.status,
                    c.name as client_name, u.name as unit_name, u.city as unit_city, u.state as unit_state
             FROM employees e
             LEFT JOIN clients c ON e.client_id = c.id
             LEFT JOIN units u ON e.unit_id = u.id
             WHERE {$whereClause}
             ORDER BY e.full_name ASC
             LIMIT ? OFFSET ?";

safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $pag['page'], $pag['limit']);
