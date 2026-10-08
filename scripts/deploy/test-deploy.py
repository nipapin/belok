import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

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


if __name__ == '__main__':
    unittest.main()
