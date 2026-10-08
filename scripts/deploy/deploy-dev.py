#!/usr/bin/python3
"""Restricted SSH receiver for GitHub's prebuilt dev release (no build or npm)."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import time
import urllib.request

ROOT = Path('/var/www/belok-dev-releases')
CURRENT = Path('/var/www/belok-dev-current')
CHECKOUT = Path('/var/www/dev.belok.pro')
CONFIG = '/etc/belok-dev/ecosystem.config.cjs'
NODE = '/root/.nvm/versions/node/v24.14.1/bin/node'
PM2 = '/root/.nvm/versions/node/v24.14.1/bin/pm2'


def pm2(*args):
    subprocess.run([PM2, *args], check=True, stdout=subprocess.DEVNULL, timeout=45)


def health(port, sha=None):
    for _ in range(20):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/products', timeout=3) as response:
                data = json.load(response)
                if isinstance(data.get('products'), list) and data['products']:
                    if sha:
                        with urllib.request.urlopen(f'http://127.0.0.1:{port}/_next/static/{sha}/_buildManifest.js', timeout=3) as manifest:
                            if manifest.status != 200:
                                raise RuntimeError('Build manifest unavailable')
                    return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError('Release health check failed')


def switch(target):
    temporary = CURRENT.with_name(CURRENT.name + '.new')
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target, target_is_directory=True)
    os.replace(temporary, CURRENT)


def main():
    import fcntl
    os.environ['PATH'] = str(Path(NODE).parent) + ':' + os.environ.get('PATH', '')
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    match = re.fullmatch(r'deploy ([a-f0-9]{40})', command)
    if not match:
        raise RuntimeError('Only deploy <commit SHA> is allowed')
    sha = match[1]
    ROOT.mkdir(mode=0o700, exist_ok=True)
    with open('/var/lock/belok-dev-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        release = ROOT / sha
        if release.exists():
            raise RuntimeError('Release already exists; use a new commit')
        release.mkdir(mode=0o700)
        archive = release / 'incoming.tar.gz'
        size = 0
        with open(archive, 'wb') as output:
            while chunk := sys.stdin.buffer.read(1024 * 1024):
                size += len(chunk)
                if size > 256 * 1024 * 1024:
                    raise RuntimeError('Release archive exceeds limit')
                output.write(chunk)
        extract_release(archive, release)
        archive.unlink()
        if (release / 'REVISION').read_text().strip() != sha or not (release / 'server.js').is_file():
            raise RuntimeError('Release revision or entry point is invalid')
        uploads = release / 'public/uploads'
        if uploads.exists():
            if any(p.name != '.gitkeep' for p in uploads.iterdir()):
                raise RuntimeError('Release must not contain uploaded files')
            (uploads / '.gitkeep').unlink(missing_ok=True)
            uploads.rmdir()
        (CHECKOUT / 'public/uploads').mkdir(exist_ok=True)
        uploads.symlink_to(CHECKOUT / 'public/uploads', target_is_directory=True)

        # Validate the release while the current dev process keeps serving requests.
        env = os.environ.copy()
        env.update(PORT='3002', HOSTNAME='127.0.0.1', NODE_ENV='production')
        with open(release / 'preview.log', 'wb') as log:
            preview = subprocess.Popen([
                NODE, f'--env-file={CHECKOUT}/.env', f'--env-file={CHECKOUT}/.env.local',
                str(release / 'server.js'),
            ], cwd=release, env=env, stdout=log, stderr=subprocess.STDOUT)
            try:
                health(3002, sha)
                if preview.poll() is not None:
                    raise RuntimeError('Preview exited')
            finally:
                preview.terminate()
                try:
                    preview.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    preview.kill()
                    preview.wait()
        old_target = CURRENT.resolve() if CURRENT.is_symlink() else None
        old_processes = json.loads(subprocess.check_output([PM2, 'jlist'], text=True))
        old_dev = next(p['pm2_env'] for p in old_processes if p['name'] == 'belok-dev')
        old_config = {'apps': [{
            'name': 'belok-dev', 'cwd': old_dev['pm_cwd'], 'script': old_dev['pm_exec_path'],
            'args': old_dev.get('args', []), 'interpreter': old_dev.get('exec_interpreter', NODE),
            'node_args': old_dev.get('node_args', []),
            'env': {k: old_dev[k] for k in ['PORT', 'HOSTNAME', 'NODE_ENV'] if k in old_dev},
        }]}
        fallback = release / 'previous-process.json'
        fallback.write_text(json.dumps(old_config))
        fallback.chmod(0o600)
        try:
            switch(release)
            if old_dev['pm_exec_path'] != str(CURRENT / 'server.js'):
                pm2('delete', 'belok-dev')
            pm2('startOrReload', CONFIG, '--only', 'belok-dev', '--update-env')
            health(3001, sha)
            pm2('save')
        except Exception:
            if old_target:
                switch(old_target)
                pm2('startOrReload', CONFIG, '--only', 'belok-dev', '--update-env')
            else:
                CURRENT.unlink(missing_ok=True)
                pm2('delete', 'belok-dev')
                pm2('startOrReload', str(fallback), '--only', 'belok-dev', '--update-env')
            health(3001)
            pm2('save')
            raise
        print(f'Deployed dev release {sha}; menu health check passed', flush=True)


def extract_release(archive, release):
    with tarfile.open(archive) as package:
        members = package.getmembers()
        if len(members) > 50_000 or sum(m.size for m in members) > 1024 * 1024 * 1024:
            raise RuntimeError('Expanded release exceeds limit')
        if any(part.startswith('.env') for m in members for part in Path(m.name).parts):
            raise RuntimeError('Environment files cannot be deployed')
        package.extractall(release, filter='data')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Dev deployment failed: {type(error).__name__}: {error}', file=sys.stderr)
        sys.exit(1)
