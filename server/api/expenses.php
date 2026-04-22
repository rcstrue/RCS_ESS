<?php
/**
 * ESS Expense Management REST API
 *
 * Endpoints via $_GET['action'] / $_POST['action']:
 *   GET    action=list            - List expenses with optional filters
 *   POST   action=create          - Create a new expense (JSON body or multipart)
 *   PUT    action=update          - Update expense fields
 *   PUT    action=approve         - Manager approves an expense
 *   PUT    action=reject          - Manager rejects an expense
 *   PUT    action=link_settlement - Link expense to a monthly settlement
 *   GET    action=dashboard       - Dashboard summary for employee or manager
 *   GET    action=summary         - Manager team summary with counts/totals by status
 *
 * Database connection is provided by requiring ../config/database.php which must
 * expose a mysqli connection object as $conn.
 */

declare(strict_types=1);

// ─────────────────────────────────────────────────────────────────────────────
// Configuration & Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Load database connection
require_once __DIR__ . '/../config/database.php';

if (!isset($conn) || !($conn instanceof mysqli)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection not available. Check config/database.php.'
    ]);
    exit;
}

if ($conn->connect_error) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Database connection failed: ' . $conn->connect_error
    ]);
    exit;
}

$conn->set_charset('utf8mb4');

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Validation Rules
// ─────────────────────────────────────────────────────────────────────────────

define('ALLOWED_CATEGORIES', ['travel', 'food', 'cab', 'supplies', 'medical', 'other']);
define('ALLOWED_STATUSES', ['pending', 'approved', 'rejected', 'reimbursed']);
define('ALLOWED_TYPES', ['expense', 'employee_advance']);
define('MAX_BILL_SIZE_BYTES', 5 * 1024 * 1024); // 5 MB
define('ALLOWED_BILL_MIME_TYPES', [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read JSON body from php://input for POST/PUT requests.
 */
function getJsonBody(): array
{
    static $body = null;
    if ($body === null) {
        $raw = file_get_contents('php://input');
        $body = json_decode($raw, true) ?: [];
    }
    return $body;
}

/**
 * Merge multipart form data ($_POST + $_FILES) with the JSON body so the
 * controller logic works uniformly regardless of content-type.
 */
function getInput(): array
{
    $json = getJsonBody();
    $post = $_POST;

    // If Content-Type is multipart/form-data, use $_POST as the base
    if (!empty($post)) {
        return array_merge($json, $post);
    }

    return $json;
}

/**
 * Send a JSON response and optionally exit.
 */
function jsonResponse(array $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/**
 * Validate that a value is present and non-empty.
 */
function requireField(array $input, string $field): ?string
{
    if (!isset($input[$field]) || trim((string)$input[$field]) === '') {
        return "Missing required field: {$field}";
    }
    return null;
}

/**
 * Validate an integer value (string or int input).
 */
function validateInt($value, string $field): ?string
{
    if ($value === null || $value === '') {
        return null; // Not an error for optional fields
    }
    if (!is_numeric($value) || (int)$value != $value) {
        return "{$field} must be a valid integer.";
    }
    return null;
}

/**
 * Validate a decimal/float value.
 */
function validateDecimal($value, string $field): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_numeric($value)) {
        return "{$field} must be a valid number.";
    }
    $floatVal = (float)$value;
    if ($floatVal < 0) {
        return "{$field} must be zero or positive.";
    }
    return null;
}

/**
 * Validate a date string (Y-m-d format).
 */
function validateDate($value, string $field): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    $d = DateTime::createFromFormat('Y-m-d', $value);
    if (!$d || $d->format('Y-m-d') !== $value) {
        return "{$field} must be a valid date in Y-m-d format.";
    }
    return null;
}

/**
 * Validate that a value is one of the allowed options.
 */
function validateInArray($value, string $field, array $allowed): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!in_array($value, $allowed, true)) {
        return "{$field} must be one of: " . implode(', ', $allowed);
    }
    return null;
}

/**
 * Get the HTTP method. Supports X-HTTP-Method-Override header for clients
 * that can't send PUT (e.g., HTML forms).
 */
function getHttpMethod(): string
{
    $method = strtoupper($_SERVER['REQUEST_METHOD']);
    // Allow override via header or query param (useful for PUT from form submissions)
    if ($method === 'POST') {
        $override = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? $_GET['_method'] ?? null;
        if ($override && in_array(strtoupper($override), ['PUT', 'PATCH', 'DELETE'], true)) {
            return strtoupper($override);
        }
    }
    return $method;
}

/**
 * Securely handle an uploaded bill file.
 * Returns ['bill_url' => string, 'bill_type' => string] or throws via error array.
 */
function handleBillUpload(): array
{
    if (!isset($_FILES['bill']) || $_FILES['bill']['error'] !== UPLOAD_ERR_OK) {
        $errorMessages = [
            UPLOAD_ERR_INI_SIZE   => 'Bill file exceeds server upload_max_filesize.',
            UPLOAD_ERR_FORM_SIZE  => 'Bill file exceeds form MAX_FILE_SIZE.',
            UPLOAD_ERR_PARTIAL    => 'Bill file was only partially uploaded.',
            UPLOAD_ERR_NO_FILE    => 'No bill file was uploaded.',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temporary folder.',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write bill file to disk.',
            UPLOAD_ERR_EXTENSION  => 'A PHP extension stopped the bill upload.',
        ];
        $code = $_FILES['bill']['error'] ?? UPLOAD_ERR_NO_FILE;
        $msg = $errorMessages[$code] ?? 'Unknown upload error.';
        return ['error' => $msg];
    }

    $file = $_FILES['bill'];

    // Check file size
    if ($file['size'] > MAX_BILL_SIZE_BYTES) {
        return ['error' => 'Bill file exceeds maximum size of 5 MB.'];
    }

    // Check MIME type (use finfo for security, never trust client-provided type)
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mimeType = $finfo->file($file['tmp_name']);

    if (!in_array($mimeType, ALLOWED_BILL_MIME_TYPES, true)) {
        return ['error' => 'Invalid bill file type. Allowed: JPEG, PNG, GIF, WebP, PDF.'];
    }

    // Generate a safe, unique filename
    $extension = match ($mimeType) {
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/gif'  => 'gif',
        'image/webp' => 'webp',
        'application/pdf' => 'pdf',
        default      => 'bin',
    };

    $fileName = 'bill_' . bin2hex(random_bytes(16)) . '.' . $extension;
    $uploadDir = __DIR__ . '/../uploads/bills/';

    // Ensure upload directory exists
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $destination = $uploadDir . $fileName;

    if (!move_uploaded_file($file['tmp_name'], $destination)) {
        return ['error' => 'Failed to save uploaded bill file.'];
    }

    // Return the URL path (relative to the API root or project root as needed)
    $billUrl = '../uploads/bills/' . $fileName;

    return [
        'bill_url'  => $billUrl,
        'bill_type' => $mimeType,
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Route & Dispatch
// ─────────────────────────────────────────────────────────────────────────────

$action    = $_GET['action'] ?? null;
$method    = getHttpMethod();
$input     = getInput();

if (!$action) {
    jsonResponse([
        'success' => false,
        'message' => 'Missing "action" query parameter.'
    ], 400);
    exit;
}

try {
    switch ($action) {
        // ── READ operations ────────────────────────────────────────────────
        case 'list':
            if ($method !== 'GET') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use GET.'], 405);
                exit;
            }
            handleList();
            break;

        case 'dashboard':
            if ($method !== 'GET') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use GET.'], 405);
                exit;
            }
            handleDashboard();
            break;

        case 'summary':
            if ($method !== 'GET') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use GET.'], 405);
                exit;
            }
            handleSummary();
            break;

        // ── WRITE operations ───────────────────────────────────────────────
        case 'create':
            if ($method !== 'POST') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use POST.'], 405);
                exit;
            }
            handleCreate();
            break;

        case 'update':
            if (!in_array($method, ['PUT', 'PATCH'], true)) {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use PUT.'], 405);
                exit;
            }
            handleUpdate();
            break;

        case 'approve':
            if ($method !== 'PUT') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use PUT.'], 405);
                exit;
            }
            handleApprove();
            break;

        case 'reject':
            if ($method !== 'PUT') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use PUT.'], 405);
                exit;
            }
            handleReject();
            break;

        case 'link_settlement':
            if ($method !== 'PUT') {
                jsonResponse(['success' => false, 'message' => 'Method not allowed. Use PUT.'], 405);
                exit;
            }
            handleLinkSettlement();
            break;

        default:
            jsonResponse([
                'success' => false,
                'message' => "Unknown action: {$action}. Valid actions: list, create, update, approve, reject, link_settlement, dashboard, summary."
            ], 400);
    }
} catch (Throwable $e) {
    // Log the actual error server-side; never expose internals to the client
    error_log("[expenses.php] Unhandled exception: {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
    jsonResponse([
        'success' => false,
        'message' => 'An internal server error occurred. Please try again later.'
    ], 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET action=list
 *
 * Optional filters (query params):
 *   employee_id, manager_id, unit_id, month, year, status, type, settlement_id
 *
 * Special behaviour:
 *   - When manager_id AND status=pending are both provided, only expenses owned
 *     by employees reporting to that manager are returned (pending approvals).
 */
function handleList(): void
{
    global $conn;

    $filters = [
        'employee_id'    => $_GET['employee_id']    ?? null,
        'manager_id'     => $_GET['manager_id']     ?? null,
        'unit_id'        => $_GET['unit_id']        ?? null,
        'month'          => $_GET['month']          ?? null,
        'year'           => $_GET['year']           ?? null,
        'status'         => $_GET['status']         ?? null,
        'type'           => $_GET['type']           ?? null,
        'settlement_id'  => $_GET['settlement_id']  ?? null,
    ];

    // Validate filter values
    $errors = [];
    foreach (['employee_id', 'manager_id', 'unit_id', 'month', 'year', 'settlement_id'] as $intField) {
        if ($filters[$intField] !== null) {
            $err = validateInt($filters[$intField], $intField);
            if ($err) $errors[] = $err;
        }
    }
    if ($filters['status'] !== null) {
        $err = validateInArray($filters['status'], 'status', ALLOWED_STATUSES);
        if ($err) $errors[] = $err;
    }
    if ($filters['type'] !== null) {
        $err = validateInArray($filters['type'], 'type', ALLOWED_TYPES);
        if ($err) $errors[] = $err;
    }

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Invalid filter(s).', 'errors' => $errors], 400);
        return;
    }

    // Build query
    $sql  = 'SELECT * FROM ess_expenses WHERE 1=1';
    $types = '';
    $params = [];

    if ($filters['employee_id'] !== null) {
        $sql .= ' AND employee_id = ?';
        $types .= 'i';
        $params[] = (int)$filters['employee_id'];
    }
    if ($filters['manager_id'] !== null) {
        $sql .= ' AND manager_id = ?';
        $types .= 'i';
        $params[] = (int)$filters['manager_id'];
    }
    if ($filters['unit_id'] !== null) {
        $sql .= ' AND unit_id = ?';
        $types .= 'i';
        $params[] = (int)$filters['unit_id'];
    }
    if ($filters['month'] !== null) {
        $sql .= ' AND month = ?';
        $types .= 'i';
        $params[] = (int)$filters['month'];
    }
    if ($filters['year'] !== null) {
        $sql .= ' AND year = ?';
        $types .= 'i';
        $params[] = (int)$filters['year'];
    }
    if ($filters['status'] !== null) {
        $sql .= ' AND status = ?';
        $types .= 's';
        $params[] = $filters['status'];
    }
    if ($filters['type'] !== null) {
        $sql .= ' AND type = ?';
        $types .= 's';
        $params[] = $filters['type'];
    }
    if ($filters['settlement_id'] !== null) {
        $sql .= ' AND settlement_id = ?';
        $types .= 'i';
        $params[] = (int)$filters['settlement_id'];
    }

    $sql .= ' ORDER BY created_at DESC';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(['success' => false, 'message' => 'Query preparation failed.'], 500);
        return;
    }

    if (!empty($params)) {
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $result = $stmt->get_result();

    $expenses = [];
    while ($row = $result->fetch_assoc()) {
        // Convert numeric strings to proper types
        $row['id']            = (int)$row['id'];
        $row['employee_id']   = (int)$row['employee_id'];
        $row['manager_id']    = (int)$row['manager_id'];
        $row['unit_id']       = (int)$row['unit_id'];
        $row['month']         = (int)$row['month'];
        $row['year']          = (int)$row['year'];
        $row['amount']        = (float)$row['amount'];
        $row['approved_by']   = $row['approved_by'] ? (int)$row['approved_by'] : null;
        $row['rejected_by']   = $row['rejected_by'] ? (int)$row['rejected_by'] : null;
        $row['edited_by']     = $row['edited_by'] ? (int)$row['edited_by'] : null;
        $row['settlement_id'] = $row['settlement_id'] ? (int)$row['settlement_id'] : null;
        $expenses[] = $row;
    }

    $stmt->close();

    jsonResponse([
        'success'  => true,
        'count'    => count($expenses),
        'expenses' => $expenses,
    ]);
}

/**
 * POST action=create
 *
 * Required fields:
 *   employee_id, manager_id, emp_name, emp_code, unit_id, month, year,
 *   category, type, amount, description, expense_date
 *
 * Optional (multipart):
 *   bill (file upload) -> bill_url, bill_type
 */
function handleCreate(): void
{
    global $conn;

    $input = getInput();

    // ── Required field validation ───────────────────────────────────────
    $requiredFields = [
        'employee_id', 'manager_id', 'emp_name', 'emp_code',
        'unit_id', 'month', 'year', 'category', 'type',
        'amount', 'description', 'expense_date',
    ];

    $errors = [];
    foreach ($requiredFields as $field) {
        $err = requireField($input, $field);
        if ($err) $errors[] = $err;
    }

    // ── Value validation ────────────────────────────────────────────────
    $intFields = ['employee_id', 'manager_id', 'unit_id', 'month', 'year'];
    foreach ($intFields as $f) {
        $err = validateInt($input[$f] ?? null, $f);
        if ($err) $errors[] = $err;
    }

    $err = validateDecimal($input['amount'] ?? null, 'amount');
    if ($err) $errors[] = $err;

    $err = validateInArray($input['category'] ?? null, 'category', ALLOWED_CATEGORIES);
    if ($err) $errors[] = $err;

    $err = validateInArray($input['type'] ?? null, 'type', ALLOWED_TYPES);
    if ($err) $errors[] = $err;

    $err = validateDate($input['expense_date'] ?? null, 'expense_date');
    if ($err) $errors[] = $err;

    // Validate month range
    if (isset($input['month']) && is_numeric($input['month'])) {
        $m = (int)$input['month'];
        if ($m < 1 || $m > 12) {
            $errors[] = 'month must be between 1 and 12.';
        }
    }

    // Validate year is reasonable
    if (isset($input['year']) && is_numeric($input['year'])) {
        $y = (int)$input['year'];
        if ($y < 2000 || $y > 2100) {
            $errors[] = 'year must be between 2000 and 2100.';
        }
    }

    // Validate amount is > 0
    if (isset($input['amount']) && is_numeric($input['amount']) && (float)$input['amount'] <= 0) {
        $errors[] = 'amount must be greater than zero.';
    }

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors], 422);
        return;
    }

    // ── Handle bill upload ──────────────────────────────────────────────
    $billUrl  = null;
    $billType = null;

    if (isset($_FILES['bill']) && $_FILES['bill']['error'] !== UPLOAD_ERR_NO_FILE) {
        $upload = handleBillUpload();
        if (isset($upload['error'])) {
            jsonResponse(['success' => false, 'message' => $upload['error']], 422);
            return;
        }
        $billUrl  = $upload['bill_url'];
        $billType = $upload['bill_type'];
    }

    // ── Insert ──────────────────────────────────────────────────────────
    $sql = 'INSERT INTO ess_expenses (
                employee_id, manager_id, emp_name, emp_code, unit_id,
                month, year, category, type, amount, description,
                bill_url, bill_type, expense_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(['success' => false, 'message' => 'Query preparation failed.'], 500);
        return;
    }

    $status = 'pending';
    $stmt->bind_param(
        'iisssiissdsssss',
        (int)$input['employee_id'],
        (int)$input['manager_id'],
        $input['emp_name'],
        $input['emp_code'],
        (int)$input['unit_id'],
        (int)$input['month'],
        (int)$input['year'],
        $input['category'],
        $input['type'],
        (float)$input['amount'],
        $input['description'],
        $billUrl,
        $billType,
        $input['expense_date'],
        $status
    );

    if ($stmt->execute()) {
        $insertId = $stmt->insert_id;
        $stmt->close();

        jsonResponse([
            'success' => true,
            'message' => 'Expense created successfully.',
            'id'      => $insertId,
        ], 201);
    } else {
        $stmt->close();
        error_log("[expenses.php] Create failed: {$stmt->error}");
        jsonResponse(['success' => false, 'message' => 'Failed to create expense.'], 500);
    }
}

/**
 * PUT action=update
 *
 * Receives: id (required) + any subset of updatable fields.
 * Tracks: edited_by (optional), edited_at (automatic)
 */
function handleUpdate(): void
{
    global $conn;

    $input = getInput();

    // ── Validate id ─────────────────────────────────────────────────────
    $err = requireField($input, 'id');
    if ($err) {
        jsonResponse(['success' => false, 'message' => $err], 400);
        return;
    }
    $err = validateInt($input['id'], 'id');
    if ($err) {
        jsonResponse(['success' => false, 'message' => $err], 400);
        return;
    }
    $id = (int)$input['id'];

    // ── Define updatable fields and their types ─────────────────────────
    $updatableFields = [
        'category'      => 's',
        'type'          => 's',
        'amount'        => 'd',
        'description'   => 's',
        'expense_date'  => 's',
        'unit_id'       => 'i',
        'month'         => 'i',
        'year'          => 'i',
        'emp_name'      => 's',
        'emp_code'      => 's',
        'status'        => 's',
        'bill_url'      => 's',
        'bill_type'     => 's',
        'settlement_id' => 'i',
    ];

    // Collect fields present in input
    $setClauses = [];
    $types      = '';
    $params     = [];

    foreach ($updatableFields as $field => $type) {
        if (array_key_exists($field, $input) && $input[$field] !== '') {
            $setClauses[] = "{$field} = ?";
            $types .= $type;
            $params[] = $input[$field];
        }
    }

    // Nothing to update
    if (empty($setClauses)) {
        jsonResponse(['success' => false, 'message' => 'No fields provided to update.'], 400);
        return;
    }

    // Validate specific fields
    $errors = [];
    if (isset($input['category'])) {
        $err = validateInArray($input['category'], 'category', ALLOWED_CATEGORIES);
        if ($err) $errors[] = $err;
    }
    if (isset($input['type'])) {
        $err = validateInArray($input['type'], 'type', ALLOWED_TYPES);
        if ($err) $errors[] = $err;
    }
    if (isset($input['amount'])) {
        $err = validateDecimal($input['amount'], 'amount');
        if ($err) $errors[] = $err;
    }
    if (isset($input['expense_date'])) {
        $err = validateDate($input['expense_date'], 'expense_date');
        if ($err) $errors[] = $err;
    }
    if (isset($input['month'])) {
        $m = (int)$input['month'];
        if ($m < 1 || $m > 12) $errors[] = 'month must be between 1 and 12.';
    }
    if (isset($input['status'])) {
        $err = validateInArray($input['status'], 'status', ALLOWED_STATUSES);
        if ($err) $errors[] = $err;
    }

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors], 422);
        return;
    }

    // Handle bill file upload if present
    if (isset($_FILES['bill']) && $_FILES['bill']['error'] !== UPLOAD_ERR_NO_FILE) {
        $upload = handleBillUpload();
        if (isset($upload['error'])) {
            jsonResponse(['success' => false, 'message' => $upload['error']], 422);
            return;
        }
        $setClauses[] = 'bill_url = ?';
        $types .= 's';
        $params[] = $upload['bill_url'];

        $setClauses[] = 'bill_type = ?';
        $types .= 's';
        $params[] = $upload['bill_type'];
    }

    // Always set edited_at; conditionally set edited_by
    $setClauses[] = 'edited_at = NOW()';
    if (isset($input['edited_by']) && $input['edited_by'] !== '') {
        $setClauses[] = 'edited_by = ?';
        $types .= 'i';
        $params[] = (int)$input['edited_by'];
    }

    // Build final query
    $sql = 'UPDATE ess_expenses SET ' . implode(', ', $setClauses) . ' WHERE id = ?';
    $types .= 'i';
    $params[] = $id;

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(['success' => false, 'message' => 'Query preparation failed.'], 500);
        return;
    }

    $stmt->bind_param($types, ...$params);

    if ($stmt->execute()) {
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse(['success' => false, 'message' => 'No expense found with the given ID or no changes detected.'], 404);
        } else {
            jsonResponse([
                'success' => true,
                'message' => 'Expense updated successfully.',
                'id'      => $id,
            ]);
        }
    } else {
        $stmt->close();
        error_log("[expenses.php] Update failed: {$stmt->error}");
        jsonResponse(['success' => false, 'message' => 'Failed to update expense.'], 500);
    }
}

/**
 * PUT action=approve
 *
 * Receives: id (required), approved_by (required)
 * Sets: status = "approved", approved_by, approved_at = NOW()
 */
function handleApprove(): void
{
    global $conn;

    $input = getInput();

    $errors = [];
    $err = requireField($input, 'id');
    if ($err) $errors[] = $err;
    $err = requireField($input, 'approved_by');
    if ($err) $errors[] = $err;

    $err = validateInt($input['id'] ?? null, 'id');
    if ($err) $errors[] = $err;
    $err = validateInt($input['approved_by'] ?? null, 'approved_by');
    if ($err) $errors[] = $err;

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors], 400);
        return;
    }

    $sql = 'UPDATE ess_expenses
            SET status = "approved",
                approved_by = ?,
                approved_at = NOW(),
                updated_at = NOW()
            WHERE id = ? AND status = "pending"';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(['success' => false, 'message' => 'Query preparation failed.'], 500);
        return;
    }

    $stmt->bind_param('ii', (int)$input['approved_by'], (int)$input['id']);

    if ($stmt->execute()) {
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse([
                'success' => false,
                'message' => 'Expense not found or is not in "pending" status.'
            ], 404);
        } else {
            jsonResponse([
                'success' => true,
                'message' => 'Expense approved successfully.',
                'id'      => (int)$input['id'],
            ]);
        }
    } else {
        $stmt->close();
        error_log("[expenses.php] Approve failed: {$stmt->error}");
        jsonResponse(['success' => false, 'message' => 'Failed to approve expense.'], 500);
    }
}

/**
 * PUT action=reject
 *
 * Receives: id (required), rejected_by (required), rejection_reason (required)
 * Sets: status = "rejected", rejected_by, rejection_reason
 */
function handleReject(): void
{
    global $conn;

    $input = getInput();

    $errors = [];
    foreach (['id', 'rejected_by', 'rejection_reason'] as $field) {
        $err = requireField($input, $field);
        if ($err) $errors[] = $err;
    }

    $err = validateInt($input['id'] ?? null, 'id');
    if ($err) $errors[] = $err;
    $err = validateInt($input['rejected_by'] ?? null, 'rejected_by');
    if ($err) $errors[] = $err;

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors], 400);
        return;
    }

    $sql = 'UPDATE ess_expenses
            SET status = "rejected",
                rejected_by = ?,
                rejection_reason = ?,
                updated_at = NOW()
            WHERE id = ? AND status = "pending"';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(['success' => false, 'message' => 'Query preparation failed.'], 500);
        return;
    }

    $stmt->bind_param(
        'isi',
        (int)$input['rejected_by'],
        trim($input['rejection_reason']),
        (int)$input['id']
    );

    if ($stmt->execute()) {
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse([
                'success' => false,
                'message' => 'Expense not found or is not in "pending" status.'
            ], 404);
        } else {
            jsonResponse([
                'success' => true,
                'message' => 'Expense rejected successfully.',
                'id'      => (int)$input['id'],
            ]);
        }
    } else {
        $stmt->close();
        error_log("[expenses.php] Reject failed: {$stmt->error}");
        jsonResponse(['success' => false, 'message' => 'Failed to reject expense.'], 500);
    }
}

/**
 * PUT action=link_settlement
 *
 * Receives: id (required), settlement_id (required)
 * Sets: settlement_id, status = "reimbursed"
 */
function handleLinkSettlement(): void
{
    global $conn;

    $input = getInput();

    $errors = [];
    foreach (['id', 'settlement_id'] as $field) {
        $err = requireField($input, $field);
        if ($err) $errors[] = $err;
    }

    $err = validateInt($input['id'] ?? null, 'id');
    if ($err) $errors[] = $err;
    $err = validateInt($input['settlement_id'] ?? null, 'settlement_id');
    if ($err) $errors[] = $err;

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors], 400);
        return;
    }

    $sql = 'UPDATE ess_expenses
            SET settlement_id = ?,
                status = "reimbursed",
                updated_at = NOW()
            WHERE id = ? AND status = "approved"';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        jsonResponse(['success' => false, 'message' => 'Query preparation failed.'], 500);
        return;
    }

    $stmt->bind_param('ii', (int)$input['settlement_id'], (int)$input['id']);

    if ($stmt->execute()) {
        $affected = $stmt->affected_rows;
        $stmt->close();

        if ($affected === 0) {
            jsonResponse([
                'success' => false,
                'message' => 'Expense not found or is not in "approved" status. Only approved expenses can be linked to settlements.'
            ], 404);
        } else {
            jsonResponse([
                'success' => true,
                'message' => 'Expense linked to settlement and marked as reimbursed.',
                'id'            => (int)$input['id'],
                'settlement_id' => (int)$input['settlement_id'],
            ]);
        }
    } else {
        $stmt->close();
        error_log("[expenses.php] Link settlement failed: {$stmt->error}");
        jsonResponse(['success' => false, 'message' => 'Failed to link settlement.'], 500);
    }
}

/**
 * GET action=dashboard
 *
 * Receives: employee_id OR manager_id (at least one required)
 * Returns:
 *   - total_pending, total_approved, total_rejected, total_reimbursed
 *   - total_amount_pending, total_amount_approved
 *   - monthly_breakdown: array of {month, year, total, pending, approved, rejected}
 */
function handleDashboard(): void
{
    global $conn;

    $employeeId = $_GET['employee_id'] ?? null;
    $managerId  = $_GET['manager_id'] ?? null;

    if ($employeeId === null && $managerId === null) {
        jsonResponse([
            'success' => false,
            'message' => 'Provide at least one of: employee_id, manager_id.'
        ], 400);
        return;
    }

    // Determine the WHERE clause and role context
    if ($managerId !== null) {
        $err = validateInt($managerId, 'manager_id');
        if ($err) {
            jsonResponse(['success' => false, 'message' => $err], 400);
            return;
        }
        $whereClause = 'WHERE manager_id = ?';
        $params      = [(int)$managerId];
        $types       = 'i';
        $scope       = 'manager';
    } else {
        $err = validateInt($employeeId, 'employee_id');
        if ($err) {
            jsonResponse(['success' => false, 'message' => $err], 400);
            return;
        }
        $whereClause = 'WHERE employee_id = ?';
        $params      = [(int)$employeeId];
        $types       = 'i';
        $scope       = 'employee';
    }

    // ── Status counts ───────────────────────────────────────────────────
    $countSql = "SELECT
                    COUNT(CASE WHEN status = 'pending' THEN 1 END)    AS total_pending,
                    COUNT(CASE WHEN status = 'approved' THEN 1 END)   AS total_approved,
                    COUNT(CASE WHEN status = 'rejected' THEN 1 END)   AS total_rejected,
                    COUNT(CASE WHEN status = 'reimbursed' THEN 1 END) AS total_reimbursed,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)  AS total_amount_pending,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) AS total_amount_approved
                 FROM ess_expenses {$whereClause}";

    $stmt = $conn->prepare($countSql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $counts = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    // ── Monthly breakdown ───────────────────────────────────────────────
    $monthlySql = "SELECT
                       year, month,
                       COUNT(*) AS total,
                       COUNT(CASE WHEN status = 'pending' THEN 1 END)    AS pending,
                       COUNT(CASE WHEN status = 'approved' THEN 1 END)   AS approved,
                       COUNT(CASE WHEN status = 'rejected' THEN 1 END)   AS rejected,
                       COUNT(CASE WHEN status = 'reimbursed' THEN 1 END) AS reimbursed,
                       COALESCE(SUM(amount), 0) AS total_amount
                   FROM ess_expenses {$whereClause}
                   GROUP BY year, month
                   ORDER BY year DESC, month DESC";

    $stmt = $conn->prepare($monthlySql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $monthlyResult = $stmt->get_result();

    $monthlyBreakdown = [];
    while ($row = $monthlyResult->fetch_assoc()) {
        $row['year']          = (int)$row['year'];
        $row['month']         = (int)$row['month'];
        $row['total']         = (int)$row['total'];
        $row['pending']       = (int)$row['pending'];
        $row['approved']      = (int)$row['approved'];
        $row['rejected']      = (int)$row['rejected'];
        $row['reimbursed']    = (int)$row['reimbursed'];
        $row['total_amount']  = (float)$row['total_amount'];
        $monthlyBreakdown[]   = $row;
    }
    $stmt->close();

    jsonResponse([
        'success'           => true,
        'scope'             => $scope,
        'total_pending'     => (int)$counts['total_pending'],
        'total_approved'    => (int)$counts['total_approved'],
        'total_rejected'    => (int)$counts['total_rejected'],
        'total_reimbursed'  => (int)$counts['total_reimbursed'],
        'total_amount_pending'  => (float)$counts['total_amount_pending'],
        'total_amount_approved' => (float)$counts['total_amount_approved'],
        'monthly_breakdown' => $monthlyBreakdown,
    ]);
}

/**
 * GET action=summary
 *
 * Receives: manager_id (required), unit_id, month, year (optional)
 * Returns: counts and totals grouped by status for the manager's team.
 */
function handleSummary(): void
{
    global $conn;

    $managerId = $_GET['manager_id'] ?? null;
    $unitId    = $_GET['unit_id'] ?? null;
    $month     = $_GET['month'] ?? null;
    $year      = $_GET['year'] ?? null;

    $err = requireField(['manager_id' => $managerId], 'manager_id');
    if ($err) {
        jsonResponse(['success' => false, 'message' => $err], 400);
        return;
    }

    $errors = [];
    $err = validateInt($managerId, 'manager_id');
    if ($err) $errors[] = $err;
    if ($unitId !== null) {
        $err = validateInt($unitId, 'unit_id');
        if ($err) $errors[] = $err;
    }
    if ($month !== null) {
        $err = validateInt($month, 'month');
        if ($err) $errors[] = $err;
    }
    if ($year !== null) {
        $err = validateInt($year, 'year');
        if ($err) $errors[] = $err;
    }

    if (!empty($errors)) {
        jsonResponse(['success' => false, 'message' => 'Validation failed.', 'errors' => $errors], 400);
        return;
    }

    // Build WHERE clause
    $where = 'WHERE manager_id = ?';
    $types = 'i';
    $params = [(int)$managerId];

    if ($unitId !== null) {
        $where .= ' AND unit_id = ?';
        $types .= 'i';
        $params[] = (int)$unitId;
    }
    if ($month !== null) {
        $where .= ' AND month = ?';
        $types .= 'i';
        $params[] = (int)$month;
    }
    if ($year !== null) {
        $where .= ' AND year = ?';
        $types .= 'i';
        $params[] = (int)$year;
    }

    // ── Overall summary by status ───────────────────────────────────────
    $sql = "SELECT
                status,
                COUNT(*) AS count,
                COALESCE(SUM(amount), 0) AS total_amount
            FROM ess_expenses
            {$where}
            GROUP BY status";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    $byStatus = [];
    $grandTotal = 0;
    $grandCount = 0;
    while ($row = $result->fetch_assoc()) {
        $row['count']        = (int)$row['count'];
        $row['total_amount'] = (float)$row['total_amount'];
        $byStatus[] = $row;
        $grandTotal += $row['total_amount'];
        $grandCount += $row['count'];
    }
    $stmt->close();

    // ── Per-employee breakdown ──────────────────────────────────────────
    $empSql = "SELECT
                   employee_id, emp_name, emp_code,
                   COUNT(*) AS total_expenses,
                   COALESCE(SUM(amount), 0) AS total_amount,
                   COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_count,
                   COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_count,
                   COUNT(CASE WHEN status = 'rejected' THEN 1 END) AS rejected_count,
                   COUNT(CASE WHEN status = 'reimbursed' THEN 1 END) AS reimbursed_count
               FROM ess_expenses
               {$where}
               GROUP BY employee_id, emp_name, emp_code
               ORDER BY total_amount DESC";

    $stmt = $conn->prepare($empSql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $empResult = $stmt->get_result();

    $employees = [];
    while ($row = $empResult->fetch_assoc()) {
        $row['employee_id']    = (int)$row['employee_id'];
        $row['total_expenses'] = (int)$row['total_expenses'];
        $row['total_amount']   = (float)$row['total_amount'];
        $row['pending_count']  = (int)$row['pending_count'];
        $row['approved_count'] = (int)$row['approved_count'];
        $row['rejected_count'] = (int)$row['rejected_count'];
        $row['reimbursed_count'] = (int)$row['reimbursed_count'];
        $employees[] = $row;
    }
    $stmt->close();

    jsonResponse([
        'success'       => true,
        'manager_id'    => (int)$managerId,
        'filters'       => [
            'unit_id' => $unitId !== null ? (int)$unitId : null,
            'month'   => $month !== null ? (int)$month : null,
            'year'    => $year !== null ? (int)$year : null,
        ],
        'by_status'     => $byStatus,
        'grand_total'   => (float)$grandTotal,
        'grand_count'   => (int)$grandCount,
        'employees'     => $employees,
    ]);
}
