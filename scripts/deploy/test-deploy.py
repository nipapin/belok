import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('deploy', Path(__file__).with_name('deploy-dev.py'))
deploy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deploy)


class ReleaseTests(unittest.TestCase):
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

    def test_path_traversal(self):
        with self.assertRaises(tarfile.FilterError):
            self.extract('../escape.js')

    def test_external_symlink(self):
        with self.assertRaises(tarfile.FilterError):
            self.extract('escape', '../../outside')

    def test_secrets_excluded(self):
        for name in ['.env', '.env.local', 'node_modules/private/.env']:
            with self.assertRaises(RuntimeError):
                self.extract(name)


class TbankTlsTests(unittest.TestCase):
    def test_missing_or_empty_certificates_stop_deployment(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / 'ca.pem'
            with patch.object(deploy, 'TBANK_CA_BUNDLE', bundle), patch.object(deploy.subprocess, 'run') as run:
                with self.assertRaisesRegex(RuntimeError, 'missing or empty'):
                    deploy.configure_tbank_tls()
                bundle.write_text('   ')
                with self.assertRaisesRegex(RuntimeError, 'missing or empty'):
                    deploy.configure_tbank_tls()
                run.assert_not_called()

    def test_node_starts_with_certificates_before_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / 'ca.pem'
            bundle.write_text('test certificate')
            def verify(*args, **kwargs):
                self.assertEqual(os.environ['NODE_EXTRA_CA_CERTS'], str(bundle))
                self.assertTrue(kwargs['check'])
                self.assertIn('rejectUnauthorized: true', args[0][2])
            with patch.object(deploy, 'TBANK_CA_BUNDLE', bundle), patch.dict(os.environ), patch.object(deploy.subprocess, 'run', side_effect=verify):
                deploy.configure_tbank_tls()

    def test_rejected_certificates_or_timeout_stop_deployment(self):
        with tempfile.TemporaryDirectory() as directory:
            bundle = Path(directory) / 'ca.pem'
            bundle.write_text('test certificate')
            for error in [subprocess.CalledProcessError(1, 'node'), subprocess.TimeoutExpired('node', 20)]:
                with self.subTest(error=type(error).__name__), patch.object(deploy, 'TBANK_CA_BUNDLE', bundle), patch.dict(os.environ), patch.object(deploy.subprocess, 'run', side_effect=error):
                    with self.assertRaisesRegex(RuntimeError, 'current release remains active'):
                        deploy.configure_tbank_tls()


if __name__ == '__main__':
    unittest.main()
