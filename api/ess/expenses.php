<?php
/**
 * ESS API — Expense Management Endpoint
 * GET:  List expenses with pagination
 * POST: Create expense
 * PUT:  Approve/reject expense
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetExpenses();
            break;
        case 'POST':
            _handleCreateExpense();
            break;
        case 'PUT':
            _handleUpdateExpense();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (Throwable $e) {
    essLog('FATAL expenses: ' . $e->getMessage());
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}

// ─── GET: List Expenses ───────────────────────────────────────────────────────

function _handleGetExpenses(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    $queryEmployeeId = $_GET['employee_id'] ?? $authId;
    $statusFilter = $_GET['status'] ?? '';
    $categoryFilter = $_GET['category'] ?? '';
    $typeFilter = $_GET['type'] ?? '';
    [$page, $limit, $offset] = getPaginationParams();

    // Build where clause
    $where = 'WHERE employee_id = ?';
    $types = 's';
    $params = [$queryEmployeeId];

    if (!empty($statusFilter)) {
        $where .= ' AND status = ?';
        $types .= 's';
        $params[] = $statusFilter;
    }

    if (!empty($categoryFilter)) {
        $where .= ' AND category = ?';
        $types .= 's';
        $params[] = $categoryFilter;
    }

    if (!empty($typeFilter)) {
        $where .= ' AND type = ?';
        $types .= 's';
        $params[] = $typeFilter;
    }

    // Count
    $countStmt = $conn->prepare("SELECT COUNT(*) AS total FROM ess_expenses {$where}");
    $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records
    $dataQuery = "
        SELECT id, employee_id, manager_id, category, type, amount, description,
               bill_url, bill_type, expense_date, status, approved_by, approved_at,
               rejection_reason, settlement_id, created_at, updated_at
        FROM ess_expenses
        {$where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
    ";
    $dataTypes = $types . 'ii';
    $dataParams = [...$params, $limit, $offset];

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $expenses = [];
    while ($row = $result->fetch_assoc()) {
        $expenses[] = [
            'id' => (int)$row['id'],
            'employee_id' => $row['employee_id'],
            'manager_id' => $row['manager_id'],
            'category' => $row['category'],
            'type' => $row['type'],
            'amount' => (float)$row['amount'],
            'description' => $row['description'] ?? '',
            'bill_url' => $row['bill_url'] ?? '',
            'bill_type' => $row['bill_type'] ?? '',
            'expense_date' => $row['expense_date'] ?? '',
            'status' => $row['status'],
            'approved_by' => $row['approved_by'],
            'approved_at' => $row['approved_at'],
            'rejection_reason' => $row['rejection_reason'] ?? '',
            'settlement_id' => $row['settlement_id'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    // Calculate total amount for filtered results
    $sumStmt = $conn->prepare("SELECT COALESCE(SUM(amount), 0) AS total_amount FROM ess_expenses {$where}");
    $sumStmt->bind_param($types, ...$params);
    $sumStmt->execute();
    $totalAmount = (float)$sumStmt->get_result()->fetch_assoc()['total_amount'];
    $sumStmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $expenses,
            'total_amount' => $totalAmount,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}

// ─── POST: Create Expense ─────────────────────────────────────────────────────

function _handleCreateExpense(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate required fields
    $category = strtolower(trim($input['category'] ?? ''));
    $type = strtolower(trim($input['type'] ?? ''));
    $amount = (float)($input['amount'] ?? 0);
    $description = trim($input['description'] ?? '');
    $expenseDate = trim($input['expense_date'] ?? '');
    $billUrl = trim($input['bill_url'] ?? '');
    $billType = trim($input['bill_type'] ?? '');

    $validCategories = ['advance', 'expense', 'employee_advance'];
    $validTypes = ['travel', 'food', 'cab', 'supplies', 'medical', 'other'];

    if (empty($category) || !in_array($category, $validCategories)) {
        jsonOutput(['success' => false, 'error' => 'Invalid category. Allowed: ' . implode(', ', $validCategories)], 400);
    }
    if (empty($type) || !in_array($type, $validTypes)) {
        jsonOutput(['success' => false, 'error' => 'Invalid type. Allowed: ' . implode(', ', $validTypes)], 400);
    }
    if ($amount <= 0) {
        jsonOutput(['success' => false, 'error' => 'Amount must be greater than zero'], 400);
    }
    if (empty($description)) {
        jsonOutput(['success' => false, 'error' => 'Description is required'], 400);
    }

    // Default expense date to today if not provided
    if (empty($expenseDate) || !strtotime($expenseDate)) {
        $expenseDate = date('Y-m-d');
    }

    // Find manager — manager_id column doesn't exist in ess_employee_cache, skip it
    $managerId = null;

    // Insert expense
    $stmt = $conn->prepare('
        INSERT INTO ess_expenses (employee_id, manager_id, category, type, amount, description, bill_url, bill_type, expense_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ');
    $pendingStatus = 'pending';
    $stmt->bind_param('sssddsssss',
        $employeeId, $managerId, $category, $type, $amount, $description,
        $billUrl, $billType, $expenseDate, $pendingStatus
    );
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'employee_id' => $employeeId,
            'category' => $category,
            'type' => $type,
            'amount' => $amount,
            'description' => $description,
            'expense_date' => $expenseDate,
            'status' => 'pending',
            'message' => 'Expense submitted successfully'
        ]
    ]);
}

// ─── PUT: Approve/Reject Expense ──────────────────────────────────────────────

function _handleUpdateExpense(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $expenseId = (int)($input['id'] ?? 0);
    $status = strtolower(trim($input['status'] ?? ''));
    $approvedBy = trim($input['approved_by'] ?? $authId);
    $rejectionReason = trim($input['rejection_reason'] ?? '');

    if ($expenseId <= 0) {
        jsonOutput(['success' => false, 'error' => 'Expense ID is required'], 400);
    }

    $validStatuses = ['approved', 'rejected', 'reimbursed'];
    if (!in_array($status, $validStatuses)) {
        jsonOutput(['success' => false, 'error' => 'Invalid status. Allowed: ' . implode(', ', $validStatuses)], 400);
    }

    if ($status === 'rejected' && empty($rejectionReason)) {
        jsonOutput(['success' => false, 'error' => 'Rejection reason is required when rejecting an expense'], 400);
    }

    // Verify expense exists and is pending
    $checkStmt = $conn->prepare('SELECT id, employee_id, status, amount FROM ess_expenses WHERE id = ?');
    $checkStmt->bind_param('i', $expenseId);
    $checkStmt->execute();
    $expense = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$expense) {
        jsonOutput(['success' => false, 'error' => 'Expense not found'], 404);
    }

    // Allow updating if pending, or transitioning approved → reimbursed
    $allowedTransitions = [
        'pending' => ['approved', 'rejected'],
        'approved' => ['reimbursed'],
    ];
    $currentStatus = $expense['status'];
    if (!isset($allowedTransitions[$currentStatus]) || !in_array($status, $allowedTransitions[$currentStatus])) {
        jsonOutput(['success' => false, 'error' => "Cannot change expense status from '{$currentStatus}' to '{$status}'"], 409);
    }

    // Update
    $updateStmt = $conn->prepare('
        UPDATE ess_expenses
        SET status = ?, approved_by = ?, approved_at = NOW(), rejection_reason = ?, updated_at = NOW()
        WHERE id = ?
    ');
    $updateStmt->bind_param('sssi', $status, $approvedBy, $rejectionReason, $expenseId);
    $updateStmt->execute();
    $updateStmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $expenseId,
            'status' => $status,
            'approved_by' => $approvedBy,
            'message' => "Expense {$status} successfully"
        ]
    ]);
}
