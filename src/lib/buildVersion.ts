export const buildVersion = {
  revision: process.env.NEXT_PUBLIC_BUILD_REVISION || 'local',
  builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || null,
};
