import packageInfo from '../../package.json';

export const buildVersion = {
  version: packageInfo.version,
  revision: process.env.NEXT_PUBLIC_BUILD_REVISION || 'local',
  builtAt: process.env.NEXT_PUBLIC_BUILD_TIME || null,
};
