import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy-prod.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ReleaseTests(unittest.TestCase):
    def test_packager_keeps_static_assets_and_excludes_environment(self):
        node = os.environ.get('CODEX_PRIMARY_RUNTIME_NODE') or shutil.which('node')
        self.assertTrue(node, 'Node is required for packaging test')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for path, content in {
                '.next/standalone/server.js': '// compiled app',
                '.next/standalone/.env': 'SECRET=must-not-ship',
                '.next/static/chunks/app.js': '// static',
                'public/icon.svg': '<svg/>',
                'public/.env.local': 'SECRET=must-not-ship',
                'migrations/001.sql': '-- separate migration',
            }.items():
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
            script = Path(__file__).resolve().parents[1] / 'package-production-release.mjs'
            sha = 'a' * 40
            subprocess.run([node, str(script)], cwd=root, env={**os.environ, 'GITHUB_SHA': sha}, check=True, stdout=subprocess.DEVNULL)
            with tarfile.open(root / 'output/belok-prod.tar.gz') as archive:
                names = archive.getnames()
                self.assertFalse(any('.env' in name for name in names))
                self.assertIn('./.next/static/chunks/app.js', names)
                self.assertIn('./public/icon.svg', names)
                self.assertEqual(archive.extractfile('./REVISION').read().decode().strip(), sha)

    def extract(self, name, link=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'release.tar.gz'
            target = root / 'target'
            target.mkdir()
            with tarfile.open(archive, 'w:gz') as package:
                entry = tarfile.TarInfo(name)
                if link:
                    entry.type = tarfile.SYMTYPE
                    entry.linkname = link
                    package.addfile(entry)
                else:
                    entry.size = 2
                    package.addfile(entry, io.BytesIO(b'ok'))
            deploy.extract_release(archive, target)
            return (target / name).read_bytes() if link is None else None

    def test_regular_release(self):
        self.assertEqual(self.extract('server.js'), b'ok')

    def test_path_traversal_and_external_links(self):
        for name, link in [('../escape.js', None), ('escape', '../../outside')]:
            with self.assertRaises(tarfile.FilterError):
                self.extract(name, link)

    def test_environment_files_excluded(self):
        for name in ['.env', '.env.local', 'node_modules/private/.env']:
            with self.assertRaises(RuntimeError):
                self.extract(name)

    def test_tbank_ca_required(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(deploy, 'TBANK_CA_BUNDLE', Path(directory) / 'missing'):
                with self.assertRaisesRegex(RuntimeError, 'missing or empty'):
                    deploy.configure_tbank_tls()


class DeploymentTests(unittest.TestCase):
    def exercise(self, failure=None, previous=False):
        sha = 'a' * 40
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            checkout = base / 'checkout'
            (checkout / 'public').mkdir(parents=True)
            (checkout / '.env').write_text('SESSION_SECRET=original')
            config = base / 'ecosystem.json'
            config.write_text(json.dumps({'apps': [{'env': {'AQSI_WORKER_ENABLED': 'true', 'NODE_EXTRA_CA_CERTS': 'bank.pem'}}]}))
            root, current = base / 'releases', base / 'current'
            old_release = root / ('b' * 40)
            if previous:
                old_release.mkdir(parents=True)
                current.symlink_to(old_release)
            data = io.BytesIO()
            with tarfile.open(fileobj=data, mode='w:gz') as archive:
                for name, value in [('server.js', b'// ready'), ('REVISION', sha.encode()), ('public/placeholder', b'public')]:
                    entry = tarfile.TarInfo(name)
                    entry.size = len(value)
                    archive.addfile(entry, io.BytesIO(value))
            data.seek(0)
            old = {'name': 'belok', 'pm2_env': {'pm_cwd': str(checkout), 'pm_exec_path': '/usr/bin/npm', 'args': ['start'], 'env': {'ORIGINAL_ENV': 'kept'}}}
            stdin = MagicMock(buffer=data)
            preview = MagicMock()
            preview.poll.return_value = None
            health_calls = []
            def check(port, revision=None):
                health_calls.append((port, revision))
                if failure == 'preview' and port == 3003:
                    raise RuntimeError('preview failed')
                if failure == 'production' and port == 3000 and revision:
                    raise RuntimeError('production failed')
            with patch.multiple(deploy, ROOT=root, CURRENT=current, CHECKOUT=checkout, CONFIG=str(config), LOCK_FILE=base/'lock', PORT=3000, PREVIEW_PORT=3003), \
                 patch.dict(os.environ, SSH_ORIGINAL_COMMAND='deploy ' + sha), \
                 patch.object(deploy, 'load_settings'), patch.object(deploy, 'configure_tbank_tls'), \
                 patch.object(deploy.sys, 'stdin', stdin), patch.object(deploy.subprocess, 'Popen', return_value=preview) as popen, \
                 patch.object(deploy.subprocess, 'check_output', return_value=json.dumps([old])), \
                 patch.object(deploy, 'health', side_effect=check), patch.object(deploy, 'pm2') as pm2:
                if failure:
                    with self.assertRaisesRegex(RuntimeError, 'failed'):
                        deploy.main()
                else:
                    deploy.main()
                self.assertEqual(popen.call_args.kwargs['env']['AQSI_WORKER_ENABLED'], 'false')
                self.assertNotIn('BELOK_PAYMENTS_DISABLED', popen.call_args.kwargs['env'])
                self.assertEqual((checkout / '.env').read_text(), 'SESSION_SECRET=original')
                self.assertEqual((root / sha / 'public/uploads').resolve(), checkout / 'public/uploads')
                if failure == 'preview':
                    pm2.assert_not_called()
                    self.assertFalse(current.exists())
                elif failure == 'production':
                    fallback = root / sha / 'previous-process.json'
                    self.assertEqual(json.loads(fallback.read_text())['apps'][0]['env']['ORIGINAL_ENV'], 'kept')
                    if previous:
                        self.assertEqual(current.resolve(), old_release)
                        pm2.assert_any_call('startOrReload', str(config), '--only', 'belok', '--update-env')
                    else:
                        self.assertFalse(current.exists())
                        pm2.assert_any_call('startOrReload', str(fallback), '--only', 'belok', '--update-env')
                    self.assertIn((3000, None), health_calls)
                else:
                    self.assertEqual(current.resolve(), root / sha)
                    pm2.assert_any_call('startOrReload', str(config), '--only', 'belok', '--update-env')
                    pm2.assert_any_call('save')

    def test_success(self):
        self.exercise()

    def test_preview_failure_keeps_running_process(self):
        self.exercise('preview')

    def test_first_deployment_failure_restores_legacy_process(self):
        self.exercise('production')

    def test_later_failure_restores_previous_release(self):
        self.exercise('production', previous=True)

    def test_restricted_command(self):
        with patch.object(deploy, 'load_settings'), patch.dict(os.environ, SSH_ORIGINAL_COMMAND='bash'):
            with self.assertRaisesRegex(RuntimeError, 'Only deploy'):
                deploy.main()


if __name__ == '__main__':
    unittest.main()
