<?php
/**
 * ESS API — Announcements Endpoint
 * GET:  List announcements (filter by target_scope, target_id)
 * POST: Create announcement (managers+ only)
 */

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

try {
    validateApiKey();

    switch ($method) {
        case 'GET':
            _handleGetAnnouncements();
            break;
        case 'POST':
            _handleCreateAnnouncement();
            break;
        default:
            jsonOutput(['success' => false, 'error' => 'Method not allowed'], 405);
    }
} catch (\Throwable $e) {
    jsonOutput(['success' => false, 'error' => 'Server error: ' . $e->getMessage() . ' in ' . basename($e->getFile()) . ':' . $e->getLine()], 500);
}

// ─── GET: List Announcements ──────────────────────────────────────────────────

function _handleGetAnnouncements(): void
{
    $employeeId = requireAuth();
    $conn = getDbConnection();

    $scopeFilter = $_GET['target_scope'] ?? '';
    $priorityFilter = $_GET['priority'] ?? '';
    [$page, $limit, $offset] = getPaginationParams();

    // Build where clause
    // Always show announcements targeted to 'all'
    // Plus announcements matching employee's unit, city, region from cache
    $where = 'WHERE (target_scope = ?';
    $types = 's';
    $params = ['all'];

    // Get employee's scope details from cache
    $cacheStmt = $conn->prepare('
        SELECT unit_id, city, state, client_id FROM ess_employee_cache WHERE employee_id = ?
    ');
    $cacheStmt->bind_param('s', $employeeId);
    $cacheStmt->execute();
    $cache = $cacheStmt->get_result()->fetch_assoc();
    $cacheStmt->close();

    if ($cache) {
        // Unit-scoped announcements
        if (!empty($cache['unit_id'])) {
            $where .= ' OR (target_scope = ? AND target_id = ?)';
            $types .= 'si';
            $params[] = 'unit';
            $params[] = (int)$cache['unit_id'];
        }
        // City-scoped announcements
        if (!empty($cache['city'])) {
            $where .= ' OR (target_scope = ? AND target_id = ?)';
            $types .= 'ss';
            $params[] = 'city';
            $params[] = $cache['city'];
        }
        // Region (state)-scoped announcements
        if (!empty($cache['state'])) {
            $where .= ' OR (target_scope = ? AND target_id = ?)';
            $types .= 'ss';
            $params[] = 'region';
            $params[] = $cache['state'];
        }
    }

    $where .= ')';

    // Apply optional filters
    if (!empty($scopeFilter)) {
        $where .= ' AND target_scope = ?';
        $types .= 's';
        $params[] = $scopeFilter;
    }

    if (!empty($priorityFilter)) {
        $where .= ' AND priority = ?';
        $types .= 's';
        $params[] = $priorityFilter;
    }

    // Count
    $countStmt = $conn->prepare("SELECT COUNT(*) AS total FROM ess_announcements {$where}");
    $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $total = (int)$countStmt->get_result()->fetch_assoc()['total'];
    $countStmt->close();

    // Fetch records
    $dataQuery = "
        SELECT a.id, a.title, a.content, a.created_by, a.target_scope, a.target_id,
               a.priority, a.created_at, a.updated_at,
               ec.full_name AS creator_name
        FROM ess_announcements a
        LEFT JOIN ess_employee_cache ec ON ec.employee_id = a.created_by
        {$where}
        ORDER BY
            CASE a.priority
                WHEN 'urgent' THEN 1
                WHEN 'high' THEN 2
                WHEN 'normal' THEN 3
                WHEN 'low' THEN 4
            END,
            a.created_at DESC
        LIMIT ? OFFSET ?
    ";
    $dataTypes = $types . 'ii';
    $dataParams = [...$params, $limit, $offset];

    $stmt = $conn->prepare($dataQuery);
    $stmt->bind_param($dataTypes, ...$dataParams);
    $stmt->execute();
    $result = $stmt->get_result();

    $announcements = [];
    while ($row = $result->fetch_assoc()) {
        $announcements[] = [
            'id' => (int)$row['id'],
            'title' => $row['title'],
            'content' => $row['content'],
            'created_by' => $row['created_by'],
            'creator_name' => $row['creator_name'] ?? '',
            'target_scope' => $row['target_scope'],
            'target_id' => $row['target_id'],
            'priority' => $row['priority'],
            'created_at' => $row['created_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'items' => $announcements,
            ...buildPagination($total, $page, $limit)
        ]
    ]);
}

// ─── POST: Create Announcement ────────────────────────────────────────────────

function _handleCreateAnnouncement(): void
{
    $employeeId = requireAuth();
    $input = getInput();
    $conn = getDbConnection();

    // Only managers and above can create announcements
    $role = getEmployeeRole($conn, $employeeId);
    if (!in_array($role, ['admin', 'manager', 'regional_manager', 'supervisor'])) {
        jsonOutput(['success' => false, 'error' => 'Access denied. Only managers and above can create announcements'], 403);
    }

    // Validate required fields
    $title = trim($input['title'] ?? '');
    $content = trim($input['content'] ?? '');
    $targetScope = strtolower(trim($input['target_scope'] ?? 'all'));
    $targetId = trim($input['target_id'] ?? '');
    $priority = strtolower(trim($input['priority'] ?? 'normal'));

    $validScopes = ['all', 'unit', 'city', 'region'];
    $validPriorities = ['low', 'normal', 'high', 'urgent'];

    if (empty($title)) {
        jsonOutput(['success' => false, 'error' => 'Title is required'], 400);
    }
    if (empty($content)) {
        jsonOutput(['success' => false, 'error' => 'Content is required'], 400);
    }
    if (!in_array($targetScope, $validScopes)) {
        jsonOutput(['success' => false, 'error' => 'Invalid target_scope. Allowed: ' . implode(', ', $validScopes)], 400);
    }
    if ($targetScope !== 'all' && empty($targetId)) {
        jsonOutput(['success' => false, 'error' => 'target_id is required when target_scope is not "all"'], 400);
    }
    if (!in_array($priority, $validPriorities)) {
        jsonOutput(['success' => false, 'error' => 'Invalid priority. Allowed: ' . implode(', ', $validPriorities)], 400);
    }

    // Insert announcement
    $stmt = $conn->prepare('
        INSERT INTO ess_announcements (title, content, created_by, target_scope, target_id, priority)
        VALUES (?, ?, ?, ?, ?, ?)
    ');
    $targetIdVal = $targetId ?: null;
    bindDynamicParams($stmt, 'ssssss', array(
        $title, $content, $employeeId, $targetScope, $targetIdVal, $priority
    ));
    $stmt->execute();
    $newId = $stmt->insert_id;
    $stmt->close();

    jsonOutput([
        'success' => true,
        'data' => [
            'id' => $newId,
            'title' => $title,
            'target_scope' => $targetScope,
            'target_id' => $targetId ?: null,
            'priority' => $priority,
            'message' => 'Announcement created successfully'
        ]
    ]);
}
