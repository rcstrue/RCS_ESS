import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/role-access — fetch all role access settings
export async function GET() {
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
