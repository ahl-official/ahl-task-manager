import { adminDb } from '@/lib/firebase/admin';
import { isVinittUser, isVishalUser, isMisDeliveryExcluded } from '@/lib/utils/names';
import type { AHLUser } from '@/types';

export interface UserNotificationPreferences {
  dailyPdf?: boolean;
  morningReminder?: boolean;
  highPriority?: boolean;
  misReports?: boolean;
  openSalonAlerts?: boolean;
}

export type AllNotificationPreferences = Record<string, UserNotificationPreferences>;

const SETTINGS_COLLECTION = 'settings';
const NOTIFICATION_DOC = 'whatsapp_notifications';

/**
 * Get default preferences for a user based on existing business rules:
 * - Vinitt Sir: all false
 * - Vishal Sir: dailyPdf=true, morningReminder=true, others false
 * - Admin: all true
 * - Member: dailyPdf=true, morningReminder=true, highPriority=true, misReports=true, openSalonAlerts=false
 */
export function getDefaultPreferences(user: Partial<AHLUser>): Required<UserNotificationPreferences> {
  if (user.isActive === false || isVinittUser(user)) {
    return {
      dailyPdf: false,
      morningReminder: false,
      highPriority: false,
      misReports: false,
      openSalonAlerts: false,
    };
  }

  if (isVishalUser(user)) {
    return {
      dailyPdf: true,
      morningReminder: true,
      highPriority: false,
      misReports: false,
      openSalonAlerts: false,
    };
  }

  const isAdmin = user.role === 'admin';
  return {
    dailyPdf: true,
    morningReminder: true,
    highPriority: true,
    misReports: !isMisDeliveryExcluded(user),
    openSalonAlerts: isAdmin,
  };
}

/**
 * Load all stored notification preferences from Firestore.
 */
export async function getAllNotificationPreferences(): Promise<AllNotificationPreferences> {
  try {
    const snap = await adminDb.collection(SETTINGS_COLLECTION).doc(NOTIFICATION_DOC).get();
    if (!snap.exists) return {};
    return (snap.data() as AllNotificationPreferences) || {};
  } catch (err) {
    console.error('[NotificationPreferences] Failed to load preferences:', err);
    return {};
  }
}

/**
 * Save / merge preferences for a specific user.
 */
export async function saveUserNotificationPreferences(
  uid: string,
  prefs: Partial<UserNotificationPreferences>,
): Promise<void> {
  try {
    await adminDb.collection(SETTINGS_COLLECTION).doc(NOTIFICATION_DOC).set(
      {
        [uid]: prefs,
      },
      { merge: true },
    );
  } catch (err) {
    console.error('[NotificationPreferences] Failed to save preferences for user', uid, err);
    throw err;
  }
}

/**
 * Check if a specific reminder type is enabled for a user.
 */
export function isNotificationEnabled(
  user: Partial<AHLUser>,
  type: keyof UserNotificationPreferences,
  allPrefs?: AllNotificationPreferences,
): boolean {
  if (user.isActive === false) return false;
  // Open Salon alerts are strictly restricted to active operational Admins
  if (type === 'openSalonAlerts' && user.role !== 'admin') {
    return false;
  }
  const uid = user.uid || '';
  const userPrefs = allPrefs?.[uid];

  if (userPrefs && typeof userPrefs[type] === 'boolean') {
    return userPrefs[type]!;
  }

  return getDefaultPreferences(user)[type];
}
