<?php
/**
 * RCS ESS - Sync API
 * POST: Upsert employee data into cache
 * Uses INSERT ON DUPLICATE KEY UPDATE
 * 
 * Also used to populate ess_employee_cache from employees table
 */

// Load config (falls back to example.config.php)
require_once __DIR__ . '/cors.php';
@require_once __DIR__ . '/config.php';
if (!function_exists('getDbConnection')) require_once __DIR__ . '/example.config.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'POST':
            handlePost($conn);
            break;
        case 'GET':
            handleGet($conn);
            break;
        default:
            jsonError('Method not allowed. Use GET or POST.', 405);
    }
} catch (Exception $e) {
    jsonError('Server error: ' . $e->getMessage(), 500);
}

// ============================================================================
// GET - Sync all approved employees into cache
// ============================================================================
function handleGet($conn) {
    // Sync all approved employees from employees table into ess_employee_cache
    $syncSql = "INSERT INTO ess_employee_cache 
                (employee_id, employee_code, full_name, mobile_number, designation, department, role, unit_id, unit_name, city, state, client_id, client_name, profile_pic_url, updated_at)
                SELECT 
                    CAST(e.id AS CHAR),
                    e.employee_code,
                    e.full_name,
                    e.mobile_number,
                    e.designation,
                    e.department,
                    CASE
                        WHEN LOWER(e.employee_role) LIKE '%regional%' OR LOWER(e.worker_category) LIKE '%regional%' THEN 'regional_manager'
                        WHEN LOWER(e.employee_role) LIKE '%manager%' OR LOWER(e.worker_category) LIKE '%manager%' THEN 'manager'
                        WHEN LOWER(e.employee_role) LIKE '%supervisor%' OR LOWER(e.worker_category) LIKE '%supervisor%'
                            OR LOWER(e.worker_category) LIKE '%team lead%' THEN 'supervisor'
                        ELSE 'employee'
                    END,
                    CAST(e.unit_id AS CHAR),
                    u.name,
                    COALESCE(u.city, e.district),
                    e.state,
                    CAST(e.client_id AS CHAR),
                    c.name,
                    e.profile_pic_url,
                    NOW()
                FROM employees e
                LEFT JOIN clients c ON e.client_id = c.id
                LEFT JOIN units u ON e.unit_id = u.id
                WHERE e.status = 'approved'
                ON DUPLICATE KEY UPDATE
                    employee_code = VALUES(employee_code),
                    full_name = VALUES(full_name),
                    mobile_number = VALUES(mobile_number),
                    designation = VALUES(designation),
                    department = VALUES(department),
                    role = VALUES(role),
                    unit_id = VALUES(unit_id),
                    unit_name = VALUES(unit_name),
                    city = VALUES(city),
                    state = VALUES(state),
                    client_id = VALUES(client_id),
                    client_name = VALUES(client_name),
                    profile_pic_url = VALUES(profile_pic_url),
                    updated_at = NOW()";
    
    $stmt = $conn->prepare($syncSql);
    $stmt->execute();
    $affectedRows = $stmt->affected_rows;
    
    jsonSuccess([
        'synced_rows' => $affectedRows,
        'message' => "Synced {$affectedRows} employee records from employees table"
    ], 'Sync completed');
}

// ============================================================================
// POST - Upsert Employee Cache (single or batch)
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    // Support single object or array of employees
    $employees = [];
    if (isset($data['employees']) && is_array($data['employees'])) {
        // Batch mode: { "employees": [...] }
        $employees = $data['employees'];
    } elseif (isset($data['employee_id'])) {
        // Single mode: { "employee_id": "...", "full_name": "...", ... }
        $employees = [$data];
    } else {
        jsonError('Invalid input. Provide either a single employee object or { "employees": [...] }', 400);
    }

    $sql = "INSERT INTO ess_employee_cache 
            (employee_id, employee_code, role, unit_id, unit_name, city, state, client_name, client_id, full_name, mobile_number, designation, profile_pic_url, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                employee_code = VALUES(employee_code),
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
                updated_at = NOW()";

    $stmt = $conn->prepare($sql);

    $inserted = 0;
    $updated = 0;
    $errors = [];

    foreach ($employees as $emp) {
        if (!isset($emp['employee_id'])) {
            $errors[] = 'Skipping record: missing employee_id';
            continue;
        }

        $employeeId = $emp['employee_id'];
        $employeeCode = isset($emp['employee_code']) ? $emp['employee_code'] : null;
        $role = isset($emp['role']) ? $emp['role'] : 'employee';
        $unitId = isset($emp['unit_id']) ? $emp['unit_id'] : null;
        $unitName = isset($emp['unit_name']) ? $emp['unit_name'] : null;
        $city = isset($emp['city']) ? $emp['city'] : null;
        $state = isset($emp['state']) ? $emp['state'] : null;
        $clientName = isset($emp['client_name']) ? $emp['client_name'] : null;
        $clientId = isset($emp['client_id']) ? $emp['client_id'] : null;
        $fullName = isset($emp['full_name']) ? $emp['full_name'] : null;
        $mobileNumber = isset($emp['mobile_number']) ? $emp['mobile_number'] : null;
        $designation = isset($emp['designation']) ? $emp['designation'] : null;
        $profilePicUrl = isset($emp['profile_pic_url']) ? $emp['profile_pic_url'] : null;

        // Validate role
        $validRoles = ['employee', 'supervisor', 'manager', 'regional_manager'];
        if (!in_array($role, $validRoles)) {
            $role = 'employee';
        }

        $stmt->bind_param('sssssssssssss',
            $employeeId, $employeeCode, $role, $unitId, $unitName, $city, $state,
            $clientName, $clientId, $fullName, $mobileNumber, $designation, $profilePicUrl
        );

        if ($stmt->execute()) {
            if ($stmt->affected_rows > 0) {
                $updated++;
            } else {
                $inserted++;
            }
        } else {
            $errors[] = "Error for {$employeeId}: " . $stmt->error;
        }
    }

    jsonSuccess([
        'total_processed' => count($employees),
        'inserted' => $inserted,
        'updated' => $updated,
        'errors' => $errors
    ], 'Sync completed successfully');
}
