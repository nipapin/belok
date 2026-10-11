#!/usr/bin/python3
"""One-time setup; leaves the running PM2 process untouched until the first release."""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys


def run(*args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run on the production VPS as root')
    node = shutil.which('node')
    pm2 = shutil.which('pm2')
    if not node or not pm2:
        raise RuntimeError('Load the existing Node/PM2 environment first')
    processes = json.loads(subprocess.check_output([pm2, 'jlist'], text=True))
    old = next((p['pm2_env'] for p in processes if p['name'] == 'belok'), None)
    if old is None:
        raise RuntimeError('PM2 process belok was not found')
    directory = Path('/etc/belok-prod')
    existing = directory / 'settings.json'
    checkout = Path(json.loads(existing.read_text())['checkout']) if existing.exists() else Path(old['pm_cwd'])
    if not (checkout / 'package.json').is_file():
        raise RuntimeError('Existing production checkout could not be identified')
    env_files = [f'--env-file={checkout / name}' for name in ['.env', '.env.local', '.env.production', '.env.production.local'] if (checkout / name).is_file()]
    if not env_files:
        raise RuntimeError('No production environment files found in ' + str(checkout))
    captured = {**old.get('env', {}), **{k: old[k] for k in ['PORT', 'HOSTNAME', 'NODE_ENV', 'AQSI_WORKER_ENABLED', 'NODE_EXTRA_CA_CERTS'] if k in old}}
    captured = {k: str(v) for k, v in captured.items() if isinstance(v, (str, int, float, bool)) and k not in ['PWD', 'OLDPWD']}
    inspect = "console.log(JSON.stringify({port:process.env.PORT||'3000',ca:process.env.NODE_EXTRA_CA_CERTS||'/etc/ssl/tbank/russian-trusted-ca-bundle.pem',vapid:process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||process.env.VAPID_PUBLIC_KEY||'',mapbox:process.env.MAPBOX_API_KEY||process.env.NEXT_PUBLIC_MAPBOX_API_KEY||''}))"
    values = json.loads(subprocess.check_output([node, *env_files, '-e', inspect], env={**os.environ, **captured}, text=True))
    port = int(values['port'])
    preview_port = int(os.environ.get('PROD_PREVIEW_PORT', '3003'))
    if port == preview_port:
        raise RuntimeError('Set PROD_PREVIEW_PORT to an unused port')
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', preview_port))
    ca = Path(values['ca'])
    if not ca.is_file() or not ca.read_bytes().strip():
        raise RuntimeError('T-Bank CA bundle is missing: ' + str(ca))
    if values['mapbox'] and not values['mapbox'].startswith('pk.'):
        raise RuntimeError('MAPBOX_API_KEY must be a public pk. token for browser builds')
    host = os.environ.get('PROD_DEPLOY_HOST') or (os.environ.get('SSH_CONNECTION', '').split() + ['', '', ''])[2]
    if not host:
        raise RuntimeError('Run over SSH or set PROD_DEPLOY_HOST to this VPS address')
    host_public = Path('/etc/ssh/ssh_host_ed25519_key.pub').read_text().split()
    host_key = f'{host} {host_public[0]} {host_public[1]}'
    directory.mkdir(mode=0o700, exist_ok=True)
    directory.chmod(0o700)
    settings = {'checkout': str(checkout), 'node': node, 'pm2': pm2, 'port': port, 'previewPort': preview_port, 'caBundle': str(ca)}
    existing.write_text(json.dumps(settings, indent=2) + '\n')
    existing.chmod(0o600)
    receiver = Path('/usr/local/bin/belok-prod-deploy')
    shutil.copyfile(Path(__file__).with_name('deploy-prod.py'), receiver)
    receiver.chmod(0o700)
    captured.update(NODE_ENV='production', PORT=str(port), HOSTNAME=old.get('HOSTNAME', '127.0.0.1'), NODE_EXTRA_CA_CERTS=str(ca))
    config = {'apps': [{'name': 'belok', 'cwd': '/var/www/belok-prod-current', 'script': 'server.js', 'interpreter': node,
                        'node_args': env_files, 'env': captured, 'autorestart': True, 'max_memory_restart': '700M', 'kill_timeout': 5000}]}
    config_path = directory / 'ecosystem.config.json'
    config_path.write_text(json.dumps(config, indent=2) + '\n')
    config_path.chmod(0o600)
    ssh = Path('/root/.ssh')
    ssh.mkdir(mode=0o700, exist_ok=True)
    key = ssh / 'belok-prod-actions'
    if not key.exists():
        run('ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C', 'belok-prod-actions', '-f', str(key))
    key.chmod(0o600)
    authorized = ssh / 'authorized_keys'
    public = key.with_suffix('.pub').read_text().strip()
    line = f'restrict,command="/usr/local/bin/belok-prod-deploy" {public}'
    previous = authorized.read_text() if authorized.exists() else ''
    if line not in previous.splitlines():
        authorized.write_text(previous.rstrip() + '\n' + line + '\n')
    authorized.chmod(0o600)
    variables = {'PROD_DEPLOY_HOST': host, 'PROD_DEPLOY_HOST_KEY': host_key, 'PROD_VAPID_PUBLIC_KEY': values['vapid'], 'PROD_MAPBOX_PUBLIC_KEY': values['mapbox']}
    public_settings = directory / 'github-variables.json'
    public_settings.write_text(json.dumps(variables, indent=2) + '\n')
    public_settings.chmod(0o600)
    print('Production receiver installed. Running belok and belok-dev have not been restarted.')
    gh = shutil.which('gh')
    if gh and subprocess.run([gh, 'auth', 'status'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        repo = 'nipapin/belok'
        with key.open() as private:
            run(gh, 'secret', 'set', 'PROD_DEPLOY_SSH_KEY', '--repo', repo, stdin=private)
        for name, value in variables.items():
            if value:
                run(gh, 'variable', 'set', name, '--repo', repo, '--body', value)
        run(gh, 'variable', 'set', 'PROD_DEPLOY_ENABLED', '--repo', repo, '--body', 'true')
        run(gh, 'workflow', 'run', 'master.yml', '--repo', repo, '--ref', 'master')
        print('GitHub configured; first production build and deployment started.')
    else:
        print('GitHub setup remains: secret PROD_DEPLOY_SSH_KEY from ' + str(key))
        print('Public Actions variables: ' + str(public_settings))
        print('After saving these, set PROD_DEPLOY_ENABLED=true and run workflow master.yml.')
        print('Keep the private key on the VPS; do not paste it into chat.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'Production setup failed: {error}', file=sys.stderr)
        sys.exit(1)
