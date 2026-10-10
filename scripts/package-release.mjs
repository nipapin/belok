import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
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
cpSync('migrations', join(release,'migrations'), {recursive:true});
cpSync('scripts/deploy/migrate-release.cjs', join(release,'migrate-release.cjs'));
if (!existsSync(join(release,'node_modules/pg'))) throw new Error('Standalone release missing pg required for dev migrations');
renameSync(join(release,'server.js'),join(release,'next-server.js'));
// The VPS deploy command cannot be modified from a Git push. Use a dev-only
// entrypoint that migrates the release's database before Next starts.
writeFileSync(join(release,'server.js'), `'use strict';
const {spawnSync}=require('node:child_process');
const {join}=require('node:path');
const done=spawnSync(process.execPath,[join(__dirname,'migrate-release.cjs')],{stdio:'inherit',env:process.env,timeout:180000});
if(done.error || done.status!==0){console.error('Dev database migrations failed; refusing to start new release',done.error?.message||done.status);process.exit(1);}
require('./next-server.js');
`);

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
