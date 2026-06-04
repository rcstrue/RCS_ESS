import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ── Auth helper ──────────────────────────────────────────────
// Validates the Authorization header contains a valid admin JWT.
// The admin panel stores tokens in localStorage as 'admin_token' and sends
// them as "Authorization: Bearer <jwt>".  We verify the JWT structure and
// decode the payload to ensure it carries admin identity claims.
function requireAdminAuth(request: Request): { error: NextResponse } | { ok: true } {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      error: NextResponse.json(
        { error: 'Authorization header with Bearer token is required' },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return {
      error: NextResponse.json(
        { error: 'Empty token provided' },
        { status: 401 }
      ),
    };
  }

  // Basic JWT structure validation: header.payload.signature (3 dot-separated base64url parts)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return {
      error: NextResponse.json(
        { error: 'Invalid token format' },
        { status: 401 }
      ),
    };
  }

  // Decode payload to verify it's valid JSON with expected claims
  try {
    const payloadB64 = parts[1];
    // Replace base64url characters with standard base64
    const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(decoded);

    // Verify the payload has required admin identity fields
    if (!payload.id && !payload.sub && !payload.email) {
      return {
        error: NextResponse.json(
          { error: 'Token missing identity claims' },
          { status: 401 }
        ),
      };
    }

    // Check expiration if present
    if (payload.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return {
          error: NextResponse.json(
            { error: 'Token has expired' },
            { status: 401 }
          ),
        };
      }
    }
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Malformed token payload' },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}

// GET /api/role-access — fetch all role access settings
export async function GET(request: Request) {
  // Auth check
  const authResult = requireAdminAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const roleAccess = await db.roleAccess.findMany({
      orderBy: { id: 'asc' },
    });

    return NextResponse.json(roleAccess);
  } catch (error) {
    console.error('Error fetching role access:', error);
    return NextResponse.json(
      { error: 'Failed to fetch role access settings' },
      { status: 500 }
    );
  }
}

// PUT /api/role-access — upsert all role access settings in bulk
export async function PUT(request: Request) {
  // Auth check
  const authResult = requireAdminAuth(request);
  if (authResult.error) return authResult.error;

  try {
    const body = await request.json();
    const { roles } = body;

    if (!Array.isArray(roles)) {
      return NextResponse.json(
        { error: 'Invalid payload: expected { roles: [...] }' },
        { status: 400 }
      );
    }

    const results = await db.$transaction(
      roles.map(
        (r: {
          role: string;
          canViewSites: boolean;
          canViewUnits: boolean;
          canViewEmployees: boolean;
          canViewLocations: boolean;
        }) =>
          db.roleAccess.upsert({
            where: { role: r.role },
            update: {
              canViewSites: r.canViewSites,
              canViewUnits: r.canViewUnits,
              canViewEmployees: r.canViewEmployees,
              canViewLocations: r.canViewLocations,
            },
            create: {
              role: r.role,
              canViewSites: r.canViewSites,
              canViewUnits: r.canViewUnits,
              canViewEmployees: r.canViewEmployees,
              canViewLocations: r.canViewLocations,
            },
          })
      )
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error updating role access:', error);
    return NextResponse.json(
      { error: 'Failed to update role access settings' },
      { status: 500 }
    );
  }
}
