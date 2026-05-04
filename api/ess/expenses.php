<?php
/**
 * ESS API — Expense Management Endpoint
 * GET:  List expenses with pagination, monthly summary, pending team
 *       ?view=types — Get available expense types/categories from DB enum
 * POST: Create expense
 * PUT:  Approve/reject expense
 *
 * NOTE: Expense type values ('travel','food','cab','supplies','medical','other')
 * come from the database enum and can be changed via ALTER TABLE.
 * Category values ('advance','expense','employee_advance') are also from DB enum.
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            handleGetExpenses();
            break;
        case 'POST':
            handleCreateExpense();
            break;
        case 'PUT':
            handleUpdateExpense();
            break;
        default:
            jsonOutput(array('success' => false, 'error' => 'Method not allowed'), 405);
    }
} catch (\Throwable $e) {
    jsonOutput(array(
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()
    ), 500);
}

// ─── GET: List Expenses or Get Types ──────────────────────────────────────

function handleGetExpenses(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    $view = isset($_GET['view']) ? $_GET['view'] : '';

    // ─── view=types: Return available categories and types from DB enum ──
    if ($view === 'types') {
        _handleExpenseTypes($conn);
        return;
    }

    if ($view === 'pending_team') {
        handlePendingTeamExpenses($authId);
        return;
    }

    $queryEmployeeId = isset($_GET['employee_id']) ? $_GET['employee_id'] : $authId;
    $statusFilter    = isset($_GET['status']) ? $_GET['status'] : '';
    $categoryFilter  = isset($_GET['category']) ? $_GET['category'] : '';
    $typeFilter      = isset($_GET['type']) ? $_GET['type'] : '';
    $monthFilter     = isset($_GET['month']) ? $_GET['month'] : '';

    list($page, $limit, $offset) = getPaginationParams();

    // Build dynamic WHERE — always start with employee_id
    $whereClauses = array('employee_id = ?');
    $types = 's';
    $values = array($queryEmployeeId);

    if (!empty($monthFilter) && preg_match('/^\d{4}-\d{2}$/', $monthFilter)) {
        $whereClauses[] = 'expense_date LIKE ?';
        $types .= 's';
        $values[] = $monthFilter . '%';
    }
    if (!empty($statusFilter)) {
        $whereClauses[] = 'status = ?';
        $types .= 's';
        $values[] = $statusFilter;
    }
    if (!empty($categoryFilter)) {
        $whereClauses[] = 'category = ?';
        $types .= 's';
        $values[] = $categoryFilter;
    }
    if (!empty($typeFilter)) {
        $whereClauses[] = 'type = ?';
        $types .= 's';
        $values[] = $typeFilter;
    }

    $where = 'WHERE ' . implode(' AND ', $whereClauses);

    // Count
    $countSql = "SELECT COUNT(*) AS cnt FROM ess_expenses {$where}";
    $countStmt = $conn->prepare($countSql);
    if (!$countStmt) {
        jsonOutput(array('success' => false, 'error' => 'Database query error'), 500);
        return;
    }
    bindDynamicParams($countStmt, $types, $values);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['cnt'];
    $countStmt->close();

    // Fetch rows — use SELECT * to avoid column mismatch
    $dataSql = "SELECT * FROM ess_expenses {$where} ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $dataTypes = $types . 'ii';
    $dataValues = $values;
    $dataValues[] = $limit;
    $dataValues[] = $offset;

    $stmt = $conn->prepare($dataSql);
    if (!$stmt) {
        jsonOutput(array('success' => false, 'error' => 'Database query error'), 500);
        return;
    }
    bindDynamicParams($stmt, $dataTypes, $dataValues);
    $stmt->execute();
    $result = $stmt->get_result();

    $expenses = array();
    while ($row = $result->fetch_assoc()) {
        $expenses[] = array(
            'id'               => (int)$row['id'],
            'employee_id'      => isset($row['employee_id']) ? $row['employee_id'] : '',
            'manager_id'       => isset($row['manager_id']) ? $row['manager_id'] : '',
            'category'         => isset($row['category']) ? $row['category'] : '',
            'type'             => isset($row['type']) ? $row['type'] : '',
            'amount'           => isset($row['amount']) ? (float)$row['amount'] : 0.0,
            'description'      => isset($row['description']) ? $row['description'] : '',
            'bill_url'         => isset($row['bill_url']) ? $row['bill_url'] : '',
            'bill_type'        => isset($row['bill_type']) ? $row['bill_type'] : '',
            'expense_date'     => isset($row['expense_date']) ? $row['expense_date'] : '',
            'status'           => isset($row['status']) ? $row['status'] : '',
            'approved_by'      => isset($row['approved_by']) ? $row['approved_by'] : '',
            'approved_at'      => isset($row['approved_at']) ? $row['approved_at'] : '',
            'rejection_reason' => isset($row['rejection_reason']) ? $row['rejection_reason'] : '',
            'settlement_id'    => isset($row['settlement_id']) ? $row['settlement_id'] : '',
            'created_at'       => isset($row['created_at']) ? $row['created_at'] : '',
            'updated_at'       => isset($row['updated_at']) ? $row['updated_at'] : '',
        );
    }
    $stmt->close();

    // Total amount
    $sumSql = "SELECT COALESCE(SUM(amount), 0) AS total_amount FROM ess_expenses {$where}";
    $sumStmt = $conn->prepare($sumSql);
    if ($sumStmt) {
        bindDynamicParams($sumStmt, $types, $values);
        $sumStmt->execute();
        $totalAmount = (float)$sumStmt->get_result()->fetch_assoc()['total_amount'];
        $sumStmt->close();
    } else {
        $totalAmount = 0;
    }

    // Monthly summary (wrapped in try so failure doesn't kill the response)
    $monthSummary = array('advance_received' => 0, 'approved_expenses' => 0, 'balance' => 0);
    $currentMonth = !empty($monthFilter) ? $monthFilter : date('Y-m');
    if (preg_match('/^\d{4}-\d{2}$/', $currentMonth)) {
        try {
            $monthLike = $currentMonth . '%';
            $advStmt = $conn->prepare("SELECT COALESCE(SUM(amount),0) AS t FROM ess_expenses WHERE employee_id = ? AND expense_date LIKE ? AND category = 'advance' AND status IN ('approved','reimbursed')");
            if ($advStmt) {
                $advStmt->bind_param('ss', $queryEmployeeId, $monthLike);
                $advStmt->execute();
                $monthSummary['advance_received'] = (float)$advStmt->get_result()->fetch_assoc()['t'];
                $advStmt->close();
            }

            $expStmt = $conn->prepare("SELECT COALESCE(SUM(amount),0) AS t FROM ess_expenses WHERE employee_id = ? AND expense_date LIKE ? AND category = 'expense' AND status IN ('approved','reimbursed')");
            if ($expStmt) {
                $expStmt->bind_param('ss', $queryEmployeeId, $monthLike);
                $expStmt->execute();
                $monthSummary['approved_expenses'] = (float)$expStmt->get_result()->fetch_assoc()['t'];
                $expStmt->close();
            }
        } catch (\Throwable $e) {
            error_log('month_summary error: ' . $e->getMessage());
        }
    }
    $monthSummary['balance'] = $monthSummary['advance_received'] - $monthSummary['approved_expenses'];

    $pag = buildPagination($total, $page, $limit);
    jsonOutput(array(
        'success' => true,
        'data' => array_merge(array(
            'items' => $expenses,
            'total_amount' => $totalAmount,
            'month_summary' => $monthSummary,
        ), $pag)
    ));
}

// ─── GET: Expense Types from DB Enum ──────────────────────────────────────

function _handleExpenseTypes($conn): void
{
    $types = array();
    $categories = array();

    // Read type enum values
    try {
        $stmt = $conn->prepare("SHOW COLUMNS FROM ess_expenses WHERE Field = 'type'");
        if ($stmt) {
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($row && preg_match("/^enum\((.*)\)$/i", $row['Type'], $matches)) {
                $vals = explode(',', $matches[1]);
                foreach ($vals as $v) {
                    $types[] = trim($v, "'\"");
                }
            }
        }
    } catch (\Throwable $e) {
        error_log('expense_types error: ' . $e->getMessage());
    }

    // Read category enum values
    try {
        $stmt = $conn->prepare("SHOW COLUMNS FROM ess_expenses WHERE Field = 'category'");
        if ($stmt) {
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($row && preg_match("/^enum\((.*)\)$/i", $row['Type'], $matches)) {
                $vals = explode(',', $matches[1]);
                foreach ($vals as $v) {
                    $categories[] = trim($v, "'\"");
                }
            }
        }
    } catch (\Throwable $e) {
        error_log('expense_categories error: ' . $e->getMessage());
    }

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'categories' => $categories,
            'types' => $types,
        )
    ));
}

// ─── GET: Pending Team Expenses ──────────────────────────────────────────

function handlePendingTeamExpenses($authId): void
{
    $conn = getDbConnection();

    try {
        $cacheStmt = $conn->prepare('SELECT unit_id, client_id FROM ess_employee_cache WHERE employee_id = ?');
        if (!$cacheStmt) {
            jsonOutput(array('success' => true, 'data' => array('items' => array())));
            return;
        }
        $cacheStmt->bind_param('s', $authId);
        $cacheStmt->execute();
        $cache = $cacheStmt->get_result()->fetch_assoc();
        $cacheStmt->close();
    } catch (\Throwable $e) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    if (!$cache) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    $teamQuery = 'SELECT employee_id FROM ess_employee_cache WHERE employee_id != ?';
    $teamTypes = 's';
    $teamValues = array($authId);

    if (!empty($cache['unit_id'])) {
        $teamQuery .= ' AND unit_id = ?';
        $teamTypes .= 'i';
        $teamValues[] = (int)$cache['unit_id'];
    } elseif (!empty($cache['client_id'])) {
        $teamQuery .= ' AND client_id = ?';
        $teamTypes .= 'i';
        $teamValues[] = (int)$cache['client_id'];
    }

    try {
        $teamStmt = $conn->prepare($teamQuery);
        if (!$teamStmt) {
            jsonOutput(array('success' => true, 'data' => array('items' => array())));
            return;
        }
        bindDynamicParams($teamStmt, $teamTypes, $teamValues);
        $teamStmt->execute();
        $teamResult = $teamStmt->get_result();
        $teamIds = array();
        while ($row = $teamResult->fetch_assoc()) {
            $teamIds[] = $row['employee_id'];
        }
        $teamStmt->close();
    } catch (\Throwable $e) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    if (empty($teamIds)) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }

    $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
    $expQuery = "SELECT e.*, c.full_name AS employee_name FROM ess_expenses e LEFT JOIN ess_employee_cache c ON c.employee_id = e.employee_id WHERE e.employee_id IN ({$placeholders}) AND e.status = 'pending' ORDER BY e.created_at DESC LIMIT 100";

    $expStmt = $conn->prepare($expQuery);
    if (!$expStmt) {
        jsonOutput(array('success' => true, 'data' => array('items' => array())));
        return;
    }
    $expStmt->bind_param(str_repeat('s', count($teamIds)), ...$teamIds);
    $expStmt->execute();
    $result = $expStmt->get_result();

    $expenses = array();
    while ($row = $result->fetch_assoc()) {
        $expenses[] = array(
            'id'             => (int)$row['id'],
            'employee_id'    => isset($row['employee_id']) ? $row['employee_id'] : '',
            'employee_name'  => isset($row['employee_name']) ? $row['employee_name'] : 'Unknown',
            'category'       => isset($row['category']) ? $row['category'] : '',
            'type'           => isset($row['type']) ? $row['type'] : '',
            'amount'         => isset($row['amount']) ? (float)$row['amount'] : 0.0,
            'description'    => isset($row['description']) ? $row['description'] : '',
            'expense_date'   => isset($row['expense_date']) ? $row['expense_date'] : '',
            'status'         => isset($row['status']) ? $row['status'] : '',
            'created_at'     => isset($row['created_at']) ? $row['created_at'] : '',
        );
    }
    $expStmt->close();

    jsonOutput(array('success' => true, 'data' => array('items' => $expenses)));
}

// ─── POST: Create Expense ─────────────────────────────────────────────────

function handleCreateExpense(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $category    = strtolower(trim(isset($input['category']) ? $input['category'] : ''));
    $type        = strtolower(trim(isset($input['type']) ? $input['type'] : ''));
    $amount      = (float)(isset($input['amount']) ? $input['amount'] : 0);
    $description = trim(isset($input['description']) ? $input['description'] : '');
    $expenseDate = trim(isset($input['expense_date']) ? $input['expense_date'] : '');
    $billUrl     = trim(isset($input['bill_url']) ? $input['bill_url'] : '');
    $billType    = trim(isset($input['bill_type']) ? $input['bill_type'] : '');

    // Validate required fields — type and category values come from DB enum,
    // so we don't hardcode validation here. Let the DB enum constraint handle it.
    if (empty($category)) {
        jsonOutput(array('success' => false, 'error' => 'Category is required'), 400);
        return;
    }
    if (empty($type)) {
        jsonOutput(array('success' => false, 'error' => 'Expense type is required'), 400);
        return;
    }
    if ($amount <= 0) {
        jsonOutput(array('success' => false, 'error' => 'Amount must be greater than zero'), 400);
        return;
    }
    if (empty($description)) {
        jsonOutput(array('success' => false, 'error' => 'Description is required'), 400);
        return;
    }

    if (empty($expenseDate) || !strtotime($expenseDate)) {
        $expenseDate = date('Y-m-d');
    }

    // Find manager
    $managerId = null;
    try {
        $mgrStmt = $conn->prepare('SELECT manager_id FROM ess_employee_cache WHERE employee_id = ?');
        if ($mgrStmt) {
            $mgrStmt->bind_param('s', $employeeId);
            $mgrStmt->execute();
            $mgr = $mgrStmt->get_result()->fetch_assoc();
            $mgrStmt->close();
            if ($mgr && isset($mgr['manager_id'])) {
                $managerId = $mgr['manager_id'];
            }
        }
    } catch (\Throwable $e) {
        // not critical
    }

    // Insert — types: s=employee, s=manager, s=category, s=type, d=amount, s=desc, s=bill_url, s=bill_type, s=date, s=status
    // NOTE: ess_employee_cache does NOT have manager_id column, so managerId will be null
    $stmt = $conn->prepare('INSERT INTO ess_expenses (employee_id, manager_id, category, type, amount, description, bill_url, bill_type, expense_date, status) VALUES (?,?,?,?,?,?,?,?,?,?)');
    if (!$stmt) {
        jsonOutput(array('success' => false, 'error' => 'Failed to create expense. Invalid category or type.'), 400);
        return;
    }
    $stmt->bind_param('ssssdsssss', $employeeId, $managerId, $category, $type, $amount, $description, $billUrl, $billType, $expenseDate, 'pending');
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput(array(
        'success' => true,
        'data' => array(
            'id' => $newId, 'employee_id' => $employeeId, 'category' => $category,
            'type' => $type, 'amount' => $amount, 'description' => $description,
            'expense_date' => $expenseDate, 'status' => 'pending',
            'message' => 'Expense submitted successfully'
        )
    ));
}

// ─── PUT: Approve/Reject Expense ──────────────────────────────────────────

function handleUpdateExpense(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $expenseId      = (int)(isset($input['id']) ? $input['id'] : 0);
    $status         = strtolower(trim(isset($input['status']) ? $input['status'] : ''));
    $approvedBy     = trim(isset($input['approved_by']) ? $input['approved_by'] : $authId);
    $rejectionReason = trim(isset($input['rejection_reason']) ? $input['rejection_reason'] : '');

    if ($expenseId <= 0) {
        jsonOutput(array('success' => false, 'error' => 'Expense ID is required'), 400);
        return;
    }
    if (!in_array($status, array('approved', 'rejected', 'reimbursed'))) {
        jsonOutput(array('success' => false, 'error' => 'Invalid status. Allowed: approved, rejected, reimbursed'), 400);
        return;
    }
    if ($status === 'rejected' && empty($rejectionReason)) {
        jsonOutput(array('success' => false, 'error' => 'Rejection reason is required'), 400);
        return;
    }

    $checkStmt = $conn->prepare('SELECT id, employee_id, status, amount FROM ess_expenses WHERE id = ?');
    if (!$checkStmt) {
        jsonOutput(array('success' => false, 'error' => 'Database error'), 500);
        return;
    }
    $checkStmt->bind_param('i', $expenseId);
    $checkStmt->execute();
    $expense = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$expense) {
        jsonOutput(array('success' => false, 'error' => 'Expense not found'), 404);
        return;
    }

    $allowed = array('pending' => array('approved', 'rejected'), 'approved' => array('reimbursed'));
    $cur = $expense['status'];
    if (!isset($allowed[$cur]) || !in_array($status, $allowed[$cur])) {
        jsonOutput(array('success' => false, 'error' => "Cannot change status from '{$cur}' to '{$status}'"), 409);
        return;
    }

    $updateStmt = $conn->prepare('UPDATE ess_expenses SET status = ?, approved_by = ?, approved_at = NOW(), rejection_reason = ?, updated_at = NOW() WHERE id = ?');
    if (!$updateStmt) {
        jsonOutput(array('success' => false, 'error' => 'Database error'), 500);
        return;
    }
    $updateStmt->bind_param('sssi', $status, $approvedBy, $rejectionReason, $expenseId);
    $updateStmt->execute();
    $updateStmt->close();

    jsonOutput(array(
        'success' => true,
        'data' => array('id' => $expenseId, 'status' => $status, 'approved_by' => $approvedBy, 'message' => "Expense {$status} successfully")
    ));
}
