import importlib.util,io,json,tarfile,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('receiver',Path(__file__).with_name('firstvds-receiver.py'));receiver=importlib.util.module_from_spec(spec);spec.loader.exec_module(receiver)
class ReceiverTests(unittest.TestCase):
 def test_exact_two_including_older_rollback_targets(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);r=root/'releases';r.mkdir();versions=[]
   for n in range(8):
    p=r/(str(n)*40+'-1-1');p.mkdir();versions.append(p)
   (root/'current').symlink_to(versions[0]);(root/'previous').symlink_to(versions[1])
   (root/'uploads').mkdir();(root/'production.env').write_text('unchanged')
   self.assertEqual(len(receiver.prune(r,root/'current',root/'previous')),6)
   self.assertEqual(set(r.iterdir()),set(versions[:2]));self.assertTrue((root/'uploads').is_dir());self.assertTrue((root/'production.env').is_file())
 def test_missing_previous_retains_one_additional_release(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);r=root/'releases';r.mkdir()
   for n in range(4):(r/(str(n)*40)).mkdir()
   (root/'current').symlink_to(next(r.iterdir()))
   receiver.prune(r,root/'current',root/'previous');self.assertEqual(len(list(r.iterdir())),2)
 def test_external_pointer_and_symlink_release_root_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);r=root/'releases';r.mkdir();outside=root/'uploads';outside.mkdir();(root/'current').symlink_to(outside)
   with self.assertRaises(RuntimeError):receiver.prune(r,root/'current',root/'previous')
   (root/'link').symlink_to(r)
   with self.assertRaises(RuntimeError):receiver.prune(root/'link',root/'none',root/'none')
 def test_archive_rejects_secrets_and_traversal(self):
  for name in ['.env','nested/.env.local','../outside']:
   with self.subTest(name=name),tempfile.TemporaryDirectory() as d:
    root=Path(d);archive=root/'release.tgz';dest=root/'dest';dest.mkdir()
    with tarfile.open(archive,'w:gz') as t:
     m=tarfile.TarInfo(name);m.size=2;t.addfile(m,io.BytesIO(b'ok'))
    with self.assertRaises((RuntimeError,tarfile.FilterError)):receiver.extract(archive,dest)
if __name__=='__main__':unittest.main()
