<?php
/**
 * RCS ESS API - Additional Helper Functions
 *
 * Only contains NEW functions not present in the server's config.php.
 * Uses function_exists() guards to prevent redeclaration.
 */

// ============================================================================
// Safe bind_param wrapper (handles intval() reference issue)
// ============================================================================

if (!function_exists('safeBindParam')) {
    /**
     * Safely binds params to a prepared statement.
     * Stores values in local variables first to satisfy PHP's pass-by-reference requirement.
     */
    function safeBindParam($stmt, $types, array $params) {
        if (empty($params)) return;

        $refs = [];
        foreach ($params as $key => $value) {
            $typeChar = $types[$key] ?? 's';

            switch ($typeChar) {
                case 'i':
                    $refs[$key] = intval($value);
                    break;
                case 'd':
                    $refs[$key] = floatval($value);
                    break;
                default:
                    $refs[$key] = strval($value);
                    break;
            }
        }

        $stmt->bind_param($types, ...$refs);
    }
}

if (!function_exists('safePaginatedSelect')) {
    /**
     * Safely execute a SELECT with pagination, returning paginated JSON response.
     */
    function safePaginatedSelect($conn, $countSql, $dataSql, $params, $types, $page, $limit) {
        $offset = ($page - 1) * $limit;

        // Count total
        $stmt = $conn->prepare($countSql);
        if (!empty($params)) {
            safeBindParam($stmt, $types, $params);
        }
        $stmt->execute();
        $countResult = $stmt->get_result();
        $total = intval($countResult->fetch_assoc()['total']);
        $countResult->free();
        $stmt->close();

        // Fetch data
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

        // Use existing buildPaginationResponse from config.php if available
        if (function_exists('buildPaginationResponse')) {
            jsonResponse(buildPaginationResponse($total, $page, $limit, $records));
        } else {
            // Fallback
            $totalPages = max(1, ceil($total / $limit));
            jsonResponse([
                'items' => $records,
                'pagination' => [
                    'page' => $page, 'limit' => $limit,
                    'total' => $total, 'total_pages' => $totalPages,
                    'has_next' => $page < $totalPages, 'has_prev' => $page > 1,
                ],
            ]);
        }
    }
}
