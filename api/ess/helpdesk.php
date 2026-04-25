<?php
/**
 * ESS API — Helpdesk Tickets Endpoint
 * GET:  List helpdesk tickets (filter by employee_id, status)
 * POST: Create helpdesk ticket
 * PUT:  Update ticket status/resolution
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetTickets();
            break;
        case 'POST':
            _handleCreateTicket();
            break;
        case 'PUT':
            _handleUpdateTicket();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (Exception $e) {
    jsonOutput(['success' => false, 'error' => 'Internal server error'], 500);
}

// ─── GET: List Tickets ────────────────────────────────────────────────────────

function _handleGetTickets(): void
{
    $authId = requireAuth();
    $conn = getDbConnection();

    $queryEmployeeId = $_GET['employee_id'] ?? $authId;
    $statusFilter = $_GET['status'] ?? '';
    $categoryFilter = $_GET['category'] ?? '';
    $priorityFilter = $_GET['priority'] ?? '';
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

    if (!empty($priorityFilter)) {
        $where .= ' AND priority = ?';
        $types .= 's';
        $params[] = $priorityFilter;
    }

    // Count
    $countStmt = $conn->prepare("SELECT COUNT(*) AS total FROM ess_helpdesk_tickets {$where}");
    $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records
    $dataQuery = "
        SELECT id, employee_id, category, subject, description, status, priority,
               resolved_by, resolution, created_at, updated_at
        FROM ess_helpdesk_tickets
        {$where}
        ORDER BY
            CASE priority
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 3
            END,
            created_at DESC
        LIMIT ? OFFSET ?
    ";
    $dataTypes = $types . 'ii';
    $dataParams = [...$params, $limit, $offset];

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $tickets = [];
    while ($row = $result->fetch_assoc()) {
        $tickets[] = [
            'id' => (int)$row['id'],
            'employee_id' => $row['employee_id'],
            'category' => $row['category'],
            'subject' => $row['subject'],
            'description' => $row['description'] ?? '',
            'status' => $row['status'],
            'priority' => $row['priority'],
            'resolved_by' => $row['resolved_by'],
            'resolution' => $row['resolution'] ?? '',
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $tickets,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}

// ─── POST: Create Ticket ──────────────────────────────────────────────────────

function _handleCreateTicket(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Validate required fields
    $category = ucfirst(strtolower(trim($input['category'] ?? '')));
    $subject = trim($input['subject'] ?? '');
    $description = trim($input['description'] ?? '');
    $priority = strtolower(trim($input['priority'] ?? 'medium'));

    $validCategories = ['It', 'Hr', 'Admin', 'Facility', 'Payroll', 'Other'];
    $validPriorities = ['low', 'medium', 'high'];

    if (empty($category) || !in_array($category, $validCategories)) {
        jsonOutput(['success' => false, 'error' => 'Invalid category. Allowed: IT, HR, Admin, Facility, Payroll, Other'], 400);
    }
    if (empty($subject)) {
        jsonOutput(['success' => false, 'error' => 'Subject is required'], 400);
    }
    if (empty($description)) {
        jsonOutput(['success' => false, 'error' => 'Description is required'], 400);
    }
    if (!in_array($priority, $validPriorities)) {
        jsonOutput(['success' => false, 'error' => 'Invalid priority. Allowed: ' . implode(', ', $validPriorities)], 400);
    }

    // Insert ticket
    $stmt = $conn->prepare('
        INSERT INTO ess_helpdesk_tickets (employee_id, category, subject, description, status, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $openStatus = 'open';
    $stmt->bind_param('ssssss',
        $employeeId, $category, $subject, $description, $openStatus, $priority
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
            'subject' => $subject,
            'status' => 'open',
            'priority' => $priority,
            'message' => 'Ticket created successfully'
        ]
    ]);
}

// ─── PUT: Update Ticket ───────────────────────────────────────────────────────

function _handleUpdateTicket(): void
{
    $authId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    $ticketId = (int)($input['id'] ?? 0);
    if ($ticketId <= 0) {
        jsonOutput(['success' => false, 'error' => 'Ticket ID is required'], 400);
    }

    // Verify ticket exists
    $checkStmt = $conn->prepare('SELECT id, employee_id, status FROM ess_helpdesk_tickets WHERE id = ?');
    $checkStmt->bind_param('i', $ticketId);
    $checkStmt->execute();
    $ticket = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if (!$ticket) {
        jsonOutput(['success' => false, 'error' => 'Ticket not found'], 404);
    }

    // Build dynamic update
    $updateFields = [];
    $types = '';
    $params = [];

    $allowedFields = [
        'category' => 's',
        'subject' => 's',
        'description' => 's',
        'status' => 's',
        'priority' => 's',
        'resolved_by' => 's',
        'resolution' => 's',
    ];

    $validStatuses = ['open', 'in_progress', 'resolved', 'closed'];

    foreach ($allowedFields as $field => $type) {
        if (array_key_exists($field, $input) && $field !== 'id') {
            $value = trim((string)$input[$field]);

            if ($field === 'status' && !in_array($value, $validStatuses)) {
                jsonOutput(['success' => false, 'error' => 'Invalid status. Allowed: ' . implode(', ', $validStatuses)], 400);
            }

            // When resolving, ensure resolved_by is set
            if ($field === 'status' && in_array($value, ['resolved', 'closed'])) {
                if (empty($input['resolved_by'])) {
                    $input['resolved_by'] = $authId;
                }
                if (empty($input['resolution']) && !array_key_exists('resolution', $input)) {
                    jsonOutput(['success' => false, 'error' => 'Resolution description is required when resolving/closing a ticket'], 400);
                }
            }

            $updateFields[] = "{$field} = ?";
            $types .= $type;
            $params[] = $value;
        }
    }

    if (empty($updateFields)) {
        jsonOutput(['success' => false, 'error' => 'No fields to update'], 400);
    }

    $updateFields[] = 'updated_at = NOW()';

    $query = 'UPDATE ess_helpdesk_tickets SET ' . implode(', ', $updateFields) . ' WHERE id = ?';
    $types .= 'i';
    $params[] = $ticketId;

    $stmt = $conn->prepare($query);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $ticketId,
            'message' => 'Ticket updated successfully'
        ]
    ]);
}
