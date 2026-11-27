import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/utils/auth';
import { adminGetAllUsers } from '@/lib/firebase/users';
import {
  getAllNotificationPreferences,
  saveUserNotificationPreferences,
  getDefaultPreferences,
  UserNotificationPreferences,
} from '@/lib/reminders/preferences';
import type { AHLUser } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [allUsers, storedPrefs] = await Promise.all([
      adminGetAllUsers().catch(() => []),
      getAllNotificationPreferences(),
    ]);

    // Build complete settings map including defaults for every user
    const resolvedPrefs: Record<string, Required<UserNotificationPreferences>> = {};
    for (const user of allUsers) {
      const defaults = getDefaultPreferences(user);
      const custom = storedPrefs[user.uid] || {};
      resolvedPrefs[user.uid] = {
        dailyPdf: custom.dailyPdf ?? defaults.dailyPdf,
        morningReminder: custom.morningReminder ?? defaults.morningReminder,
        highPriority: custom.highPriority ?? defaults.highPriority,
        misReports: custom.misReports ?? defaults.misReports,
        openSalonAlerts: custom.openSalonAlerts ?? defaults.openSalonAlerts,
      };
    }

    return NextResponse.json({
      success: true,
      data: resolvedPrefs,
    });
  } catch (err: any) {
    console.error('GET /api/reminders/settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { uid, preferences } = body;

    if (!uid || typeof preferences !== 'object') {
      return NextResponse.json({ success: false, error: 'uid and preferences object are required' }, { status: 400 });
    }

    await saveUserNotificationPreferences(uid, preferences);

    return NextResponse.json({
      success: true,
      message: 'Notification preferences updated',
    });
  } catch (err: any) {
    console.error('PATCH /api/reminders/settings error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
