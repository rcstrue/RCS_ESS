<?php
/**
 * RCS ESS - Announcements API
 * GET:  List announcements (filtered by scope/target)
 * POST: Create a new announcement
 *
 * DB Schema: target_scope enum includes 'region' (not 'unit')
 *   Actual scope values: 'all', 'managers', 'admin'
 *   'all' = visible to employees in poster's allocated units + all managers/admins
 *   'managers' = visible only to managers and admins
 *   'admin' = visible only to admins
 */

require_once __DIR__ . '/cors.php';
@require_once __DIR__ . '/config.php';
require_once __DIR__ . '/helpers.php';

$conn = getDbConnection();
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {
        case 'GET':  handleGet($conn);  break;
        case 'POST': handlePost($conn); break;
        default:     jsonError('Method not allowed. Use GET or POST.', 405);
    }
} catch (Exception $e) {
    jsonError('Server error: ' . $e->getMessage(), 500);
}

// ============================================================================
// GET - List Announcements
// ============================================================================
function handleGet($conn) {
    $targetScope = getQueryParam('target_scope');
    $targetId    = getQueryParam('target_id');
    $priority    = getQueryParam('priority');
    $page        = max(1, intval(getQueryParam('page', 1)));
    $limit       = min(100, max(1, intval(getQueryParam('limit', 20))));
    $offset      = ($page - 1) * $limit;

    $where  = ['1=1'];
    $params = [];
    $types  = '';

    if ($targetScope) {
        $validScopes = ['all', 'managers', 'admin'];
        if (!in_array($targetScope, $validScopes)) {
            jsonError('Invalid target_scope. Allowed: ' . implode(', ', $validScopes), 400);
        }
        $where[] = 'a.target_scope = ?';
        $params[] = $targetScope;
        $types .= 's';
    }

    if ($targetId) {
        $where[] = '(a.target_scope = "all" OR a.target_id = ?)';
        $params[] = $targetId;  // VARCHAR(50)
        $types .= 's';
    }

    if ($priority) {
        $where[] = 'a.priority = ?';
        $params[] = $priority;
        $types .= 's';
    }

    $whereClause = implode(' AND ', $where);

    // Count
    $countSql = "SELECT COUNT(*) as total FROM ess_announcements a WHERE {$whereClause}";
    $stmt = $conn->prepare($countSql);
    if (!empty($params)) {
        safeBindParam($stmt, $types, $params);
    }
    $stmt->execute();
    $countResult = $stmt->get_result();
    $total = intval($countResult->fetch_assoc()['total']);
    $countResult->free();
    $stmt->close();

    // Fetch
    $dataSql = "SELECT a.*, e.full_name as creator_name
                FROM ess_announcements a
                LEFT JOIN employees e ON a.created_by = e.id
                WHERE {$whereClause}
                ORDER BY
                    CASE a.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
                    a.created_at DESC
                LIMIT ? OFFSET ?";

    $allParams = array_merge($params, [$limit, $offset]);
    $allTypes  = $types . 'ii';

    $stmt = $conn->prepare($dataSql);
    if (!empty($allParams)) {
        safeBindParam($stmt, $allTypes, $allParams);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $records = [];
    while ($row = $result->fetch_assoc()) {
        $records[] = $row;
    }
    $result->free();
    $stmt->close();

    jsonResponse(buildPaginationResponse($total, $page, $limit, $records));
}

// ============================================================================
// POST - Create Announcement
// ============================================================================
function handlePost($conn) {
    $data = getJsonInput();

    $title       = getRequiredParam($data, 'title');
    $content     = getRequiredParam($data, 'content');
    $priority    = isset($data['priority']) ? $data['priority'] : 'normal';
    $targetScope = isset($data['target_scope']) ? $data['target_scope'] : 'all';
    $targetId    = isset($data['target_id']) ? $data['target_id'] : null;  // VARCHAR(50)
    $createdBy   = isset($data['created_by']) ? $data['created_by'] : null;  // VARCHAR(50)

    $validPriorities = ['urgent', 'high', 'normal', 'low'];
    if (!in_array($priority, $validPriorities)) {
        jsonError('Invalid priority. Allowed: ' . implode(', ', $validPriorities), 400);
    }

    $validScopes = ['all', 'managers', 'admin'];
    if (!in_array($targetScope, $validScopes)) {
        jsonError('Invalid target_scope. Allowed: ' . implode(', ', $validScopes), 400);
    }

    // INSERT: title(s), content(s), priority(s), target_scope(s), target_id(s), created_by(s), NOW(), NOW()
    // 6 bind params: s,s,s,s,s,s = 'ssssss'
    $stmt = $conn->prepare("INSERT INTO ess_announcements (title, content, priority, target_scope, target_id, created_by, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())");
    safeBindParam($stmt, 'ssssss', [$title, $content, $priority, $targetScope, $targetId, $createdBy]);
    $stmt->execute();
    $announcementId = intval($conn->insert_id);
    $stmt->close();

    // Fetch created record
    $stmt = $conn->prepare("SELECT a.*, e.full_name as creator_name
                            FROM ess_announcements a
                            LEFT JOIN employees e ON a.created_by = e.id
                            WHERE a.id = ?");
    safeBindParam($stmt, 'i', [$announcementId]);
    $stmt->execute();
    $result = $stmt->get_result();
    $record = $result->fetch_assoc();
    $result->free();
    $stmt->close();

    jsonSuccess($record, 'Announcement created successfully');
}
