#!/usr/bin/python3
"""Run the independent weather job with the existing production environment."""
import json
import os
from pathlib import Path
import subprocess

settings = json.loads(Path('/etc/belok-prod/settings.json').read_text())
checkout = Path(settings['checkout'])
configured = json.loads(Path('/etc/belok-prod/ecosystem.config.json').read_text())['apps'][0]['env']
environment = {**os.environ, **{key: str(value) for key, value in configured.items()}}
environment['PATH'] = str(Path(settings['node']).parent) + ':' + environment.get('PATH', '')
env_files = [f'--env-file={checkout / name}' for name in ['.env', '.env.local', '.env.production', '.env.production.local'] if (checkout / name).is_file()]
result = subprocess.run([settings['node'], *env_files, str(checkout / 'scripts/weather/sync-weather.mjs')], cwd=checkout, env=environment, timeout=1800)
raise SystemExit(result.returncode)
