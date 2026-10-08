import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const revision = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('GITHUB_SHA must identify the release');
if (!existsSync('.next/standalone/server.js')) throw new Error('Standalone build is missing');
const release = resolve('output/ci-release');
if (existsSync(release)) throw new Error('Release directory already exists');
mkdirSync(release, { recursive: true });
const filter = (source) => !basename(source).startsWith('.env');
cpSync('.next/standalone', release, { recursive: true, filter });
cpSync('.next/static', join(release, '.next/static'), { recursive: true });
cpSync('public', join(release, 'public'), { recursive: true, filter });
writeFileSync(join(release, 'REVISION'), `${revision}\n`);
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.env')) throw new Error('Environment file in release');
    if (entry.isDirectory()) check(join(directory, entry.name));
  }
}
check(release);
execFileSync('tar', ['-czf', resolve('output/belok-dev.tar.gz'), '-C', release, '.']);
console.log('Packaged standalone release without environment files');
