<?php
/**
 * RCS ESS - Employee Search API
 * GET: Search employees from employees/clients/units tables
 * Supports full-text search across name, designation, mobile, employee_code
 * Filter by client_id, unit_id
 *
 * Role-based visibility:
 *   - Employee: can only see own profile (use scope=self)
 *   - Supervisor: sees all employees in their unit (scope=unit)
 *   - Manager/Field Officer: sees all employees in their state (scope=city)
 *   - Regional Manager: sees all employees (scope=all)
 */

require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';
validateApiKey();

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':
            handleGet($conn);
            break;
        default:
            jsonError('Method not allowed. Use GET.', 405);
    }
} catch (Exception $e) {
    jsonError('Server error: ' . $e->getMessage(), 500);
}

// ============================================================================
// GET - Search Employees (with role-based filtering)
// ============================================================================
function handleGet($conn) {
    $q = getQueryParam('q');
    $unitId = getQueryParam('unit_id');
    $clientId = getQueryParam('client_id');
    $state = getQueryParam('state');
    $designation = getQueryParam('designation');

    // Role-based scope filtering
    $scope = getQueryParam('scope'); // 'unit' | 'city' | 'all' | 'self'
    $requesterId = getQueryParam('requester_id'); // The employee making the request

    $where = ['e.status = "approved"'];
    $params = [];
    $types = '';

    // ── Apply role-based scope filter ──
    if ($scope && $requesterId) {
        switch ($scope) {
            case 'unit':
                // Supervisor: only employees in the same unit
                $where[] = 'e.unit_id = (SELECT unit_id FROM employees WHERE id = ? LIMIT 1)';
                $params[] = $requesterId;
                $types .= 's';
                break;
            case 'city':
                // Manager/Field Officer/Area Manager: all employees in the same state
                $where[] = 'e.state = (SELECT state FROM employees WHERE id = ? LIMIT 1)';
                $params[] = $requesterId;
                $types .= 's';
                break;
            case 'all':
                // Regional Manager: no filter applied, sees everything
                break;
            case 'self':
                // Employee: only own data
                $where[] = 'e.id = ?';
                $params[] = $requesterId;
                $types .= 's';
                break;
        }
    }

    // ── Client filter ──
    if ($clientId) {
        $where[] = 'e.client_id = ?';
        $params[] = $clientId;
        $types .= 'i';
    }

    // ── Unit filter ──
    if ($unitId) {
        $where[] = 'e.unit_id = ?';
        $params[] = $unitId;
        $types .= 'i';
    }

    // ── Full-text search query across multiple fields ──
    if ($q && trim($q) !== '') {
        $searchTerm = '%' . trim($q) . '%';
        $where[] = "(e.full_name LIKE ? OR e.designation LIKE ? OR e.mobile_number LIKE ? OR e.employee_code LIKE ?)";
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $params[] = $searchTerm;
        $types .= 'ssss';
    }

    // ── State filter ──
    if ($state) {
        $where[] = 'e.state LIKE ?';
        $params[] = '%' . $state . '%';
        $types .= 's';
    }

    // ── Designation filter ──
    if ($designation) {
        $where[] = 'e.designation LIKE ?';
        $params[] = '%' . $designation . '%';
        $types .= 's';
    }

    $whereClause = implode(' AND ', $where);
    $pag = getPaginationParams();

    // Set higher limit for directory view
    $pag['limit'] = min(100, max(1, intval(getQueryParam('limit', 100))));
    $pag['offset'] = ($pag['page'] - 1) * $pag['limit'];

    // ── Count total ──
    $countSql = "SELECT COUNT(*) as total FROM employees e WHERE {$whereClause}";
    $stmt = $conn->prepare($countSql);
    if ($params) {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $total = $stmt->get_result()->fetch_assoc()['total'];

    // ── Fetch employees with client/unit names ──
    $sql = "SELECT
                e.id as employee_id,
                e.employee_code,
                e.full_name,
                e.mobile_number,
                e.designation,
                e.department,
                e.employment_type,
                e.state,
                e.profile_pic_url,
                e.profile_pic_cropped_url,
                e.date_of_joining,
                e.client_id,
                e.unit_id,
                c.name as client_name,
                u.name as unit_name,
                COALESCE(u.city, e.district) as city,
                CASE
                    WHEN LOWER(e.employee_role) LIKE '%regional%' OR LOWER(e.worker_category) LIKE '%regional%'
                        THEN 'regional_manager'
                    WHEN LOWER(e.employee_role) LIKE '%manager%' OR LOWER(e.worker_category) LIKE '%manager%'
                        THEN 'manager'
                    WHEN LOWER(e.employee_role) LIKE '%supervisor%' OR LOWER(e.worker_category) LIKE '%supervisor%'
                        OR LOWER(e.worker_category) LIKE '%team lead%'
                        THEN 'supervisor'
                    ELSE 'employee'
                END as role
            FROM employees e
            LEFT JOIN clients c ON e.client_id = c.id
            LEFT JOIN units u ON e.unit_id = u.id
            WHERE {$whereClause}
            ORDER BY e.full_name ASC
            LIMIT ? OFFSET ?";

    $allParams = array_merge($params, [$pag['limit'], $pag['offset']]);
    $allTypes = $types . 'ii';

    $stmt = $conn->prepare($sql);
    if ($allParams) {
        $stmt->bind_param($allTypes, ...$allParams);
    }
    $stmt->execute();
    $records = [];
    while ($row = $stmt->get_result()->fetch_assoc()) {
        $records[] = $row;
    }

    // ── Also fetch summary stats for the scope ──
    $summary = null;
    if ($scope && $requesterId && $scope !== 'self') {
        $summaryWhere = [];
        $summaryParams = [];
        $summaryTypes = '';

        switch ($scope) {
            case 'unit':
                $summaryWhere[] = 'e.unit_id = (SELECT unit_id FROM employees WHERE id = ? LIMIT 1)';
                $summaryParams[] = $requesterId;
                $summaryTypes .= 's';
                break;
            case 'city':
                $summaryWhere[] = 'e.state = (SELECT state FROM employees WHERE id = ? LIMIT 1)';
                $summaryParams[] = $requesterId;
                $summaryTypes .= 's';
                break;
            case 'all':
                // No filter for regional manager
                break;
        }

        $summaryWhereStr = empty($summaryWhere) ? '1=1' : implode(' AND ', $summaryWhere);

        $sumSql = "SELECT
            COUNT(*) as total_employees,
            COUNT(DISTINCT e.unit_id) as total_units,
            COUNT(DISTINCT e.state) as total_cities,
            COUNT(DISTINCT CASE
                WHEN LOWER(e.employee_role) LIKE '%supervisor%' OR LOWER(e.worker_category) LIKE '%supervisor%'
                    OR LOWER(e.worker_category) LIKE '%team lead%'
                THEN e.id END) as supervisors,
            COUNT(DISTINCT CASE
                WHEN (LOWER(e.employee_role) NOT LIKE '%supervisor%' AND LOWER(e.worker_category) NOT LIKE '%supervisor%'
                    AND LOWER(e.worker_category) NOT LIKE '%team lead%'
                    AND LOWER(e.employee_role) NOT LIKE '%manager%' AND LOWER(e.worker_category) NOT LIKE '%manager%'
                    AND LOWER(e.employee_role) NOT LIKE '%regional%' AND LOWER(e.worker_category) NOT LIKE '%regional%')
                THEN e.id END) as workers
        FROM employees e
        WHERE e.status = 'approved' AND {$summaryWhereStr}";

        $sumStmt = $conn->prepare($sumSql);
        if ($summaryParams) {
            $sumStmt->bind_param($summaryTypes, ...$summaryParams);
        }
        $sumStmt->execute();
        $summary = $sumStmt->get_result()->fetch_assoc();
    }

    $response = buildPaginationResponse($total, $pag['page'], $pag['limit'], $records);
    if ($summary) {
        $response['summary'] = $summary;
    }

    jsonResponse($response);
}
