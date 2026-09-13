import { getAppSetting, setAppSetting } from '@/lib/appSettings';

export const NOTIFICATION_SETTINGS_KEY = 'notification_settings';

export type NotificationSettings = {
  adminNewOrdersPush: boolean;
  adminNewOrdersSound: boolean;
  autoPushOrderStatus: boolean;
  autoPushLoyalty: boolean;
  autoPushWelcome: boolean;
};

export const defaultNotificationSettings: NotificationSettings = {
  adminNewOrdersPush: true,
  adminNewOrdersSound: true,
  autoPushOrderStatus: true,
  autoPushLoyalty: true,
  autoPushWelcome: true,
};

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function sanitizeNotificationSettings(raw: unknown): NotificationSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    adminNewOrdersPush: asBool(obj.adminNewOrdersPush, defaultNotificationSettings.adminNewOrdersPush),
    adminNewOrdersSound: asBool(obj.adminNewOrdersSound, defaultNotificationSettings.adminNewOrdersSound),
    autoPushOrderStatus: asBool(obj.autoPushOrderStatus, defaultNotificationSettings.autoPushOrderStatus),
    autoPushLoyalty: asBool(obj.autoPushLoyalty, defaultNotificationSettings.autoPushLoyalty),
    autoPushWelcome: asBool(obj.autoPushWelcome, defaultNotificationSettings.autoPushWelcome),
  };
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const value = await getAppSetting<unknown>(NOTIFICATION_SETTINGS_KEY);
  return sanitizeNotificationSettings(value);
}

export async function saveNotificationSettings(
  next: NotificationSettings
): Promise<NotificationSettings> {
  const settings = sanitizeNotificationSettings(next);
  await setAppSetting(NOTIFICATION_SETTINGS_KEY, settings);
  return settings;
}
