import { getAppSetting, setAppSetting } from '@/lib/appSettings';

export const HOME_PUBLISHED_KEY = 'home_published';

/** Missing setting means the main page stays hidden (redirect to /menu). */
export async function isHomePublished(): Promise<boolean> {
  const value = await getAppSetting<unknown>(HOME_PUBLISHED_KEY);
  return value === true;
}

export async function setHomePublished(published: boolean): Promise<boolean> {
  await setAppSetting(HOME_PUBLISHED_KEY, published);
  return published;
}
