<?php
/**
 * RCS ESS - CORS Handler
 * Must be included at the VERY TOP of every API file (before any output).
 *
 * Allowed origins for API access:
 * - https://join.rcsfacility.com  (main app - same origin, but allow explicitly)
 * - https://sid.rcsfacility.com   (testing domain)
 * - http://localhost:5173         (local dev)
 *
 * To add a new domain, add it to the $allowedOrigins array below.
 */

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    header('Access-Control-Allow-Origin: ' . getAllowedOrigin());
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Cache-Control');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400'); // 24 hours cache for preflight
    http_response_code(204);
    exit;
}

// Set CORS headers for all requests
header('Access-Control-Allow-Origin: ' . getAllowedOrigin());
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Cache-Control');
header('Access-Control-Allow-Credentials: true');

/**
 * Determine the allowed origin based on the request's Origin header.
 * Returns '*' for unknown origins (development mode), or the specific origin if whitelisted.
 */
function getAllowedOrigin() {
    $allowedOrigins = [
        'https://join.rcsfacility.com',   // Main production domain
        'https://sid.rcsfacility.com',    // Testing domain
        'http://localhost:5173',          // Vite dev server
        'http://localhost:3000',          // Next.js dev server
    ];

    $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

    // If the origin is in our whitelist, use it
    if (in_array($requestOrigin, $allowedOrigins)) {
        return $requestOrigin;
    }

    // For any subdomain of rcsfacility.com, allow it
    if (preg_match('/^https?:\/\/[a-zA-Z0-9-]+\.rcsfacility\.com$/', $requestOrigin)) {
        return $requestOrigin;
    }

    // Default: allow the main domain (safe fallback)
    return 'https://join.rcsfacility.com';
}
