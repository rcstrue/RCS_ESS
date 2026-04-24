<?php
/**
 * RCS ESS - Expenses API
 * GET:  List expense claims
 * POST: Create expense claim
 * PUT:  Approve/reject expense claim
 *
 * DB Schema (ess_expenses):
 *   id           INT AUTO_INCREMENT
 *   employee_id  VARCHAR(50)
 *   category     ENUM('advance','expense','employee_advance')
 *   type         ENUM('travel','food','cab','supplies','medical','other')
 *   amount       DECIMAL(10,2)
 *   expense_date DATE
 *   description  TEXT
 *   month        INT (1-12)
 *   year         INT (4-digit)
 *   bill_url     VARCHAR(255)
 *   bill_type    VARCHAR(20)
 *   status       ENUM('pending','approved','rejected','reimbursed') DEFAULT 'pending'
 *   approved_by  VARCHAR(50)
 *   approved_at  DATETIME
 *   rejected_by  VARCHAR(50)
 *   rejection_reason TEXT
 *   manager_id   VARCHAR(50)
 *   emp_name     VARCHAR(100)
 *   emp_code     VARCHAR(50)
 *   unit_id      INT
 *   settlement_id INT
 *   edited_by    VARCHAR(50)
 *   edited_at    DATETIME
 *   created_at   DATETIME
 *   updated_at   DATETIME
 */

@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':  handleGet($conn);  break;
        case 'POST': handlePost($conn); break;
        case 'PUT':  handlePut($conn);  break;
        default:     jsonError('Method not allowed. Use GET, POST, or PUT.', 405);
    }
} catch (Exception $e) {
    jsonError('Server error: ' . $e->getMessage(), 500);
}

// ============================================================================
// GET - List Expenses
// ============================================================================
function handleGet($conn) {
    $employeeId = getQueryParam('employee_id');
    $status     = getQueryParam('status');
    $category   = getQueryParam('category');
    $month      = getQueryParam('month');
    $year       = getQueryParam('year');

    $where  = ['1=1'];
    $params = [];
    $types  = '';

    if ($employeeId) {
        $where[] = 'ex.employee_id = ?';
        $params[] = $employeeId;  // VARCHAR(50)
        $types .= 's';
    }
    if ($status) {
        $where[] = 'ex.status = ?';
        $params[] = $status;
        $types .= 's';
    }
    if ($category) {
        $where[] = 'ex.category = ?';
        $params[] = $category;
        $types .= 's';
    }
    if ($month) {
        $where[] = 'ex.month = ?';
        $params[] = intval($month);
        $types .= 'i';
    }
    if ($year) {
        $where[] = 'ex.year = ?';
        $params[] = intval($year);
        $types .= 'i';
    }

    $whereClause = implode(' AND ', $where);
    $pag = getPaginationParams();

    $countSql = "SELECT COUNT(*) as total FROM ess_expenses ex WHERE {$whereClause}";
    $dataSql  = "SELECT ex.*, e.full_name as employee_name, e.employee_code as employee_code,
                        e.designation as employee_designation, u.name as unit_name,
                        ap.full_name as approver_name
                 FROM ess_expenses ex
                 LEFT JOIN employees e ON ex.employee_id = e.id
                 LEFT JOIN units u ON ex.unit_id = u.id
                 LEFT JOIN employees ap ON ex.approved_by = ap.id
                 WHERE {$whereClause}
                 ORDER BY ex.created_at DESC
                 LIMIT ? OFFSET ?";

    safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $pag['page'], $pag['limit']);
}

// ============================================================================
// POST - Create Expense
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    $employeeId  = getRequiredParam($data, 'employee_id');  // VARCHAR(50)
    // Frontend sends 'type' (advance/expense), PHP expects 'category' — accept both
    $category    = isset($data['category']) ? $data['category'] : (isset($data['type']) ? $data['type'] : '');
    if (empty($category)) {
        jsonError('Missing required field: category (or type)', 400);
    }
    $type        = isset($data['type']) ? $data['type'] : 'other';  // travel|food|cab|supplies|medical|other
    $amount      = floatval(getRequiredParam($data, 'amount'));
    $expenseDate = getRequiredParam($data, 'expense_date');
    $description = isset($data['description']) ? $data['description'] : null;
    $month       = isset($data['month']) ? intval($data['month']) : null;
    $year        = isset($data['year']) ? intval($data['year']) : null;
    $billUrl     = isset($data['bill_url']) ? $data['bill_url'] : null;
    $billType    = isset($data['bill_type']) ? $data['bill_type'] : null;

    // Validate category
    $validCategories = ['advance', 'expense', 'employee_advance'];
    if (!in_array($category, $validCategories)) {
        jsonError('Invalid category. Allowed: ' . implode(', ', $validCategories), 400);
    }

    // Validate type
    $validTypes = ['travel', 'food', 'cab', 'supplies', 'medical', 'other'];
    if (!in_array($type, $validTypes)) {
        jsonError('Invalid type. Allowed: ' . implode(', ', $validTypes), 400);
    }

    if ($amount <= 0) {
        jsonError('Amount must be greater than 0', 400);
    }

    // Auto-derive month/year from expense_date if not provided
    if (($month === null || $year === null) && $expenseDate) {
        $dateParts = explode('-', $expenseDate);
        if (count($dateParts) >= 3) {
            if ($month === null) $month = intval($dateParts[1]);
            if ($year === null) $year = intval($dateParts[0]);
        }
    }

    // Get employee info for emp_name, emp_code, unit_id, manager_id
    $empName = '';
    $empCode = '';
    $unitId  = null;
    $managerId = null;

    $empStmt = $conn->prepare("SELECT full_name, employee_code, unit_id, manager_id FROM employees WHERE id = ? LIMIT 1");
    safeBindParam($empStmt, 's', [$employeeId]);
    $empStmt->execute();
    $empResult = $empStmt->get_result();
    $empRow = $empResult->fetch_assoc();
    $empResult->free();
    $empStmt->close();

    if ($empRow) {
        $empName  = $empRow['full_name'] ?? '';
        $empCode  = $empRow['employee_code'] ?? '';
        $unitId   = $empRow['unit_id'] ? intval($empRow['unit_id']) : null;
        $managerId = $empRow['manager_id'] ? strval($empRow['manager_id']) : null;
    }

    // Try full INSERT with all known columns, fall back if columns don't exist
    $insertCols = ['employee_id', 'category', 'type', 'amount', 'description', 'expense_date', 'status', 'created_at', 'updated_at'];
    $insertVals = [$employeeId, $category, $type, $amount, $description, $expenseDate, 'pending'];
    $insertTypes = 'sssdsss';

    // Optional columns to try adding
    $optionalCols = [
        ['month',       $month,      $month !== null ? 'i' : null],
        ['year',        $year,       $year !== null ? 'i' : null],
        ['bill_url',    $billUrl,    $billUrl !== null ? 's' : null],
        ['bill_type',   $billType,   $billType !== null ? 's' : null],
        ['emp_name',    $empName,    !empty($empName) ? 's' : null],
        ['emp_code',    $empCode,    !empty($empCode) ? 's' : null],
        ['manager_id',  $managerId,  $managerId !== null ? 's' : null],
        ['unit_id',     $unitId,     $unitId !== null ? 'i' : null],
    ];

    foreach ($optionalCols as [$col, $val, $type]) {
        if ($type !== null) {
            $insertCols[] = $col;
            $insertVals[] = $val;
            $insertTypes .= $type;
        }
    }

    // Append NOW() for created_at, updated_at
    $colStr = implode(', ', $insertCols);
    $placeholders = implode(', ', array_fill(0, count($insertVals), '?'));
    $placeholders .= ', NOW(), NOW()';

    $sql = "INSERT INTO ess_expenses ({$colStr}) VALUES ({$placeholders})";

    $insertSuccess = false;
    $insertError = null;

    $stmt = $conn->prepare($sql);
    if ($stmt) {
        safeBindParam($stmt, $insertTypes, $insertVals);
        try {
            $stmt->execute();
            $insertSuccess = true;
        } catch (Exception $e) {
            $insertError = $e->getMessage();
        }
        $stmt->close();
    } else {
        $insertError = $conn->error;
    }

    // Fallback: minimal INSERT with only core columns
    if (!$insertSuccess) {
        $sql2 = "INSERT INTO ess_expenses (employee_id, category, type, amount, description, expense_date, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())";
        $stmt2 = $conn->prepare($sql2);
        if ($stmt2) {
            safeBindParam($stmt2, 'sssdsss', [$employeeId, $category, $type, $amount, $description, $expenseDate]);
            $stmt2->execute();
            $insertSuccess = true;
            $stmt2->close();
        }
    }

    if (!$insertSuccess) {
        jsonError('Failed to create expense: ' . ($insertError ?: 'Unknown error'), 500);
    }

    $expenseId = $conn->insert_id;

    // Fetch created record
    $stmt = $conn->prepare("SELECT ex.*, e.full_name as employee_name, e.employee_code as employee_code, u.name as unit_name
                            FROM ess_expenses ex
                            LEFT JOIN employees e ON ex.employee_id = e.id
                            LEFT JOIN units u ON ex.unit_id = u.id
                            WHERE ex.id = ?");
    safeBindParam($stmt, 'i', [$expenseId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    jsonSuccess($record, 'Expense created successfully');
}

// ============================================================================
// PUT - Approve/Reject Expense
// ============================================================================
function handlePut($conn) {
    $data = getJsonInput();

    $id              = intval(getRequiredParam($data, 'id'));
    $status          = getRequiredParam($data, 'status');
    $approvedBy      = isset($data['approved_by']) ? strval($data['approved_by']) : null;
    $rejectionReason = isset($data['rejection_reason']) ? $data['rejection_reason'] : null;

    $validStatuses = ['approved', 'rejected', 'reimbursed'];
    if (!in_array($status, $validStatuses)) {
        jsonError('Invalid status. Allowed: ' . implode(', ', $validStatuses), 400);
    }

    // Get existing expense
    $stmt = $conn->prepare("SELECT ex.*, e.full_name as employee_name FROM ess_expenses ex LEFT JOIN employees e ON ex.employee_id = e.id WHERE ex.id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result  = $stmt->get_result();
    $expense = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    if (!$expense) {
        jsonError('Expense not found', 404);
    }

    if ($expense['status'] !== 'pending') {
        jsonError('This expense has already been processed', 400);
    }

    // Try UPDATE with all known columns
    $updateCols = ['status = ?', 'approved_by = ?', 'approved_at = NOW()'];
    $updateVals = [$status, $approvedBy];
    $updateTypes = 'ss';

    if ($status === 'rejected') {
        $updateCols[] = 'rejected_by = ?';
        $updateVals[] = $approvedBy;
        $updateTypes .= 's';

        if ($rejectionReason !== null) {
            $updateCols[] = 'rejection_reason = ?';
            $updateVals[] = $rejectionReason;
            $updateTypes .= 's';
        }
    }

    $updateCols[] = 'updated_at = NOW()';

    $setClause = implode(', ', $updateCols);
    $sql = "UPDATE ess_expenses SET {$setClause} WHERE id = ?";

    $updateSuccess = false;
    $updateError = null;

    $stmt = $conn->prepare($sql);
    if ($stmt) {
        $updateVals[] = $id;
        $updateTypes .= 'i';
        safeBindParam($stmt, $updateTypes, $updateVals);
        try {
            $stmt->execute();
            $updateSuccess = true;
        } catch (Exception $e) {
            $updateError = $e->getMessage();
        }
        $stmt->close();
    } else {
        $updateError = $conn->error;
    }

    // Fallback: simple UPDATE
    if (!$updateSuccess) {
        $sql2 = "UPDATE ess_expenses SET status = ?, updated_at = NOW() WHERE id = ?";
        $stmt2 = $conn->prepare($sql2);
        if ($stmt2) {
            safeBindParam($stmt2, 'si', [$status, $id]);
            $stmt2->execute();
            $updateSuccess = true;
            $stmt2->close();
        }
    }

    if (!$updateSuccess) {
        jsonError('Failed to update expense: ' . ($updateError ?: 'Unknown error'), 500);
    }

    // Fetch updated record
    $stmt = $conn->prepare("SELECT ex.*, e.full_name as employee_name, ap.full_name as approver_name, u.name as unit_name
                            FROM ess_expenses ex
                            LEFT JOIN employees e ON ex.employee_id = e.id
                            LEFT JOIN employees ap ON ex.approved_by = ap.id
                            LEFT JOIN units u ON ex.unit_id = u.id
                            WHERE ex.id = ?");
    safeBindParam($stmt, 'i', [$id]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    // Notification (employee_id is VARCHAR(50))
    try {
        $notifTitle   = $status === 'approved' ? 'Expense Approved' : ($status === 'rejected' ? 'Expense Rejected' : 'Expense Reimbursed');
        $notifMessage = "Your expense of ₹{$expense['amount']} ({$expense['category']}) has been {$status}.";
        if ($rejectionReason && $status === 'rejected') {
            $notifMessage .= " Reason: {$rejectionReason}";
        }
        $notifType = $status === 'approved' ? 'success' : ($status === 'rejected' ? 'warning' : 'info');

        $stmt = $conn->prepare("INSERT INTO ess_notifications (employee_id, title, message, type, link, created_at) VALUES (?, ?, ?, ?, '/expenses', NOW())");
        safeBindParam($stmt, 'ssss', [$expense['employee_id'], $notifTitle, $notifMessage, $notifType]);
        $stmt->execute();
        $stmt->close();
    } catch (Exception $e) {
        // Non-critical: don't fail the request if notification fails
    }

    $msg = $status === 'approved' ? 'Expense approved' : ($status === 'rejected' ? 'Expense rejected' : 'Expense marked as reimbursed');
    jsonSuccess($record, $msg);
}
