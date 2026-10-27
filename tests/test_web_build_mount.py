import unittest,importlib.util,tempfile,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('layers',ROOT/'scripts/prepare-web-layers.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class BuildMount(unittest.TestCase):
 def test_generated_dockerfile_and_readonly_mount(self):
  plan=m.read_plan(ROOT/'scripts/web-layer-plan.json');text=m.dockerfile(plan)
  self.assertEqual(text,(ROOT/'Dockerfile').read_text());self.assertIn('--mount=type=bind,source=.,target=/source',text);self.assertNotIn('COPY frontend /source/frontend',text)
 def test_code_output_and_original_media_hashes(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)/'source';out=Path(tmp)/'out';(root/'frontend/art').mkdir(parents=True);(root/'frontend/art/a.png').write_bytes(b'original image');(root/'frontend/app.js').write_text('code');(root/'hediyesistemi').mkdir();(root/'hediyesistemi/a.svg').write_text('<svg/>')
   plan={'layers':[{'source':'frontend/art','destination':'/srv/frontend/art'},{'source':'hediyesistemi','destination':'/srv/frontend/hediyesistemi'}]}
   m.prepare(root,out,plan);self.assertEqual((out/'frontend/app.js').read_text(),'code');self.assertFalse((out/'frontend/art').exists());files=json.loads((out/'frontend/apk-content-manifest.json').read_text())['files'];self.assertEqual(files['art/a.png'],hashlib.sha256(b'original image').hexdigest());self.assertIn('hediyesistemi/a.svg',files)
if __name__=='__main__':unittest.main()
