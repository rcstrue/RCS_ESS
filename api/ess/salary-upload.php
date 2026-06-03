<?php
/**
 * ESS API — Salary Bulk Upload Endpoint
 * POST:  Upload salary rows (bulk insert into salary_upload_records)
 * GET:   View uploaded records with filters
 *
 * Carry-forward is calculated on the frontend before submission.
 * This endpoint stores each row and logs the bulk upload.
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'POST':
            handleBulkUpload();
            break;
        case 'GET':
            handleGetUploads();
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

// ─── POST: Bulk Upload Salary Records ─────────────────────────────────────────

function handleBulkUpload(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate input
    if (!isset($input['rows']) || !is_array($input['rows'])) {
        jsonOutput(array('success' => false, 'error' => 'No rows provided. Expected { rows: [...] }'), 400);
        return;
    }

    $rows = $input['rows'];
    if (empty($rows)) {
        jsonOutput(array('success' => false, 'error' => 'Rows array is empty'), 400);
        return;
    }

    // ── Ensure table exists (auto-create if missing) ──
    _ensureTable($conn);

    $totalRows = count($rows);
    $successCount = 0;
    $errorCount = 0;
    $errors = array();

    $insertSql = "INSERT INTO salary_upload_records
        (employee_id, employee_name, amount, month, year, salary_date, remarks, carry_forward, status, uploaded_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW())";

    $stmt = $conn->prepare($insertSql);
    if (!$stmt) {
        jsonOutput(array('success' => false, 'error' => 'Database prepare error: ' . $conn->error), 500);
        return;
    }

    $conn->begin_transaction();

    try {
        foreach ($rows as $idx => $row) {
            $employeeId   = isset($row['employeeId']) ? trim(strval($row['employeeId'])) : '';
            $employeeName = isset($row['employeeName']) ? trim(strval($row['employeeName'])) : '';
            $amount       = isset($row['amount']) ? floatval($row['amount']) : 0;
            $month        = isset($row['month']) ? intval($row['month']) : 0;
            $year         = isset($row['year']) ? intval($row['year']) : 0;
            $salaryDate   = isset($row['date']) ? trim(strval($row['date'])) : '';
            $remarks      = isset($row['remarks']) ? trim(strval($row['remarks'])) : '';
            $carryForward = isset($row['carryForward']) ? floatval($row['carryForward']) : 0;

            // Validate
            if (empty($employeeId)) {
                $errors[] = "Row " . ($idx + 1) . ": Employee ID is required";
                $errorCount++;
                continue;
            }
            if ($amount <= 0) {
                $errors[] = "Row " . ($idx + 1) . " ({$employeeId}): Amount must be > 0";
                $errorCount++;
                continue;
            }
            if ($month < 1 || $month > 12) {
                $errors[] = "Row " . ($idx + 1) . " ({$employeeId}): Month must be 1-12";
                $errorCount++;
                continue;
            }
            if ($year < 1900 || $year > 2100) {
                $errors[] = "Row " . ($idx + 1) . " ({$employeeId}): Invalid year";
                $errorCount++;
                continue;
            }
            if (empty($salaryDate)) {
                $salaryDate = sprintf('%04d-%02d-01', $year, $month);
            }

            // Check if employee exists
            $empExists = _checkEmployeeExists($conn, $employeeId);

            bindDynamicParams($stmt, 'ssdiidsd s', array(
                $employeeId,
                $employeeName,
                $amount,
                $month,
                $year,
                $salaryDate,
                $remarks,
                $carryForward,
                $authId
            ));

            if ($stmt->execute()) {
                $successCount++;
            } else {
                $errors[] = "Row " . ($idx + 1) . " ({$employeeId}): Insert failed - " . $stmt->error;
                $errorCount++;
            }
        }

        // Log the bulk upload
        _logBulkUpload($conn, $totalRows, $successCount, $errorCount, $authId);

        $conn->commit();

        $message = "Successfully uploaded {$successCount} of {$totalRows} salary records.";
        if ($errorCount > 0) {
            $message .= " {$errorCount} row(s) failed.";
        }

        jsonOutput(array(
            'success'  => true,
            'data'     => array(
                'message'       => $message,
                'total_rows'    => $totalRows,
                'success_count' => $successCount,
                'error_count'   => $errorCount,
                'errors'        => $errors,
            )
        ));
    } catch (\Throwable $e) {
        $conn->rollback();
        jsonOutput(array('success' => false, 'error' => 'Upload failed: ' . $e->getMessage()), 500);
    } finally {
        if ($stmt) $stmt->close();
    }
}

// ─── GET: View Uploaded Records ──────────────────────────────────────────────

function handleGetUploads(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    _ensureTable($conn);

    $month  = isset($_GET['month']) ? intval($_GET['month']) : 0;
    $year   = isset($_GET['year']) ? intval($_GET['year']) : 0;
    $empId  = isset($_GET['employee_id']) ? trim($_GET['employee_id']) : '';
    $status = isset($_GET['status']) ? trim($_GET['status']) : '';

    list($page, $limit, $offset) = getPaginationParams();

    // Build WHERE
    $whereClauses = array();
    $types = '';
    $values = array();

    if ($month > 0 && $month <= 12) {
        $whereClauses[] = 'month = ?';
        $types .= 'i';
        $values[] = $month;
    }
    if ($year > 0) {
        $whereClauses[] = 'year = ?';
        $types .= 'i';
        $values[] = $year;
    }
    if (!empty($empId)) {
        $whereClauses[] = 'employee_id = ?';
        $types .= 's';
        $values[] = $empId;
    }
    if (!empty($status)) {
        $whereClauses[] = 'status = ?';
        $types .= 's';
        $values[] = $status;
    }

    $where = !empty($whereClauses) ? 'WHERE ' . implode(' AND ', $whereClauses) : '';

    // Count
    $countSql = "SELECT COUNT(*) AS cnt FROM salary_upload_records {$where}";
    $countStmt = $conn->prepare($countSql);
    if ($countStmt) {
        if (!empty($values)) bindDynamicParams($countStmt, $types, $values);
        $countStmt->execute();
        $total = (int)$countStmt->get_result()->fetch_assoc()['cnt'];
        $countStmt->close();
    } else {
        $total = 0;
    }

    // Fetch
    $dataSql = "SELECT * FROM salary_upload_records {$where} ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $dataTypes = $types . 'ii';
    $dataValues = $values;
    $dataValues[] = $limit;
    $dataValues[] = $offset;

    $stmt = $conn->prepare($dataSql);
    if (!$stmt) {
        jsonOutput(array('success' => false, 'error' => 'Database query error'), 500);
        return;
    }
    if (!empty($dataValues)) bindDynamicParams($stmt, $dataTypes, $dataValues);
    $stmt->execute();
    $result = $stmt->get_result();

    $records = array();
    while ($row = $result->fetch_assoc()) {
        $records[] = array(
            'id'             => (int)$row['id'],
            'employee_id'    => isset($row['employee_id']) ? $row['employee_id'] : '',
            'employee_name'  => isset($row['employee_name']) ? $row['employee_name'] : '',
            'amount'         => isset($row['amount']) ? (float)$row['amount'] : 0,
            'month'          => isset($row['month']) ? (int)$row['month'] : 0,
            'year'           => isset($row['year']) ? (int)$row['year'] : 0,
            'salary_date'    => isset($row['salary_date']) ? $row['salary_date'] : '',
            'remarks'        => isset($row['remarks']) ? $row['remarks'] : '',
            'carry_forward'  => isset($row['carry_forward']) ? (float)$row['carry_forward'] : 0,
            'status'         => isset($row['status']) ? $row['status'] : '',
            'uploaded_by'    => isset($row['uploaded_by']) ? $row['uploaded_by'] : '',
            'created_at'     => isset($row['created_at']) ? $row['created_at'] : '',
        );
    }
    $stmt->close();

    // Summary totals
    $sumSql = "SELECT COALESCE(SUM(amount),0) AS total_amount, COALESCE(SUM(carry_forward),0) AS total_carry_forward FROM salary_upload_records {$where}";
    $sumStmt = $conn->prepare($sumSql);
    if ($sumStmt) {
        if (!empty($values)) bindDynamicParams($sumStmt, $types, $values);
        $sumStmt->execute();
        $sumRow = $sumStmt->get_result()->fetch_assoc();
        $sumStmt->close();
    } else {
        $sumRow = array('total_amount' => 0, 'total_carry_forward' => 0);
    }

    $pag = buildPagination($total, $page, $limit);
    jsonOutput(array(
        'success' => true,
        'data' => array_merge(array(
            'items'                 => $records,
            'total_amount'          => (float)$sumRow['total_amount'],
            'total_carry_forward'   => (float)$sumRow['total_carry_forward'],
        ), $pag)
    ));
}

// ─── Helper: Ensure Table Exists ─────────────────────────────────────────────

function _ensureTable($conn): void
{
    $conn->query("CREATE TABLE IF NOT EXISTS salary_upload_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        employee_name VARCHAR(100) DEFAULT '',
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        month INT NOT NULL,
        year INT NOT NULL,
        salary_date DATE DEFAULT NULL,
        remarks TEXT DEFAULT NULL,
        carry_forward DECIMAL(12,2) DEFAULT 0,
        status ENUM('pending','processed','rejected') DEFAULT 'pending',
        uploaded_by VARCHAR(50) DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_employee (employee_id),
        INDEX idx_month_year (month, year),
        INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

// ─── Helper: Check if Employee Exists ────────────────────────────────────────

function _checkEmployeeExists($conn, $employeeId): bool
{
    // Try numeric ID first (employees table), then string code
    $stmt = $conn->prepare("SELECT id FROM employees WHERE id = ? OR employee_code = ? LIMIT 1");
    if ($stmt) {
        $stmt->bind_param('ss', $employeeId, $employeeId);
        $stmt->execute();
        $result = $stmt->get_result();
        $exists = $result->num_rows > 0;
        $result->free();
        $stmt->close();
        return $exists;
    }
    return false;
}

// ─── Helper: Log Bulk Upload ────────────────────────────────────────────────

function _logBulkUpload($conn, $totalRows, $successCount, $errorCount, $uploadedBy): void
{
    try {
        $conn->query("CREATE TABLE IF NOT EXISTS bulk_upload_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            upload_type ENUM('attendance','salary_structure','salary_update','employee_master','salary_upload') NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_path VARCHAR(500) DEFAULT NULL,
            total_rows INT DEFAULT 0,
            processed_rows INT DEFAULT 0,
            error_rows INT DEFAULT 0,
            status ENUM('pending','processing','completed','failed') DEFAULT 'completed',
            error_details TEXT DEFAULT NULL,
            period_id INT DEFAULT NULL,
            client_id INT DEFAULT NULL,
            unit_id INT DEFAULT NULL,
            uploaded_by INT NOT NULL,
            started_at DATETIME DEFAULT NULL,
            completed_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");

        $status = $errorCount > 0 ? 'completed' : 'completed';
        $logStmt = $conn->prepare("INSERT INTO bulk_upload_logs (upload_type, file_name, total_rows, processed_rows, error_rows, status, uploaded_by, started_at, completed_at) VALUES ('salary_upload', 'xlsx_upload', ?, ?, ?, ?, ?, NOW(), NOW())");
        if ($logStmt) {
            $logStmt->bind_param('iiiisi', $totalRows, $successCount, $errorCount, $status, $uploadedBy);
            $logStmt->execute();
            $logStmt->close();
        }
    } catch (\Throwable $e) {
        error_log('bulk_upload_log error: ' . $e->getMessage());
    }
}
