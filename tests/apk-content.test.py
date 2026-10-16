"""Install-time pack: real encodes, public path mapping, original bytes and versioning."""
import base64
import io
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('builder', ROOT/'scripts/build-apk-content.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class ContentPackTests(unittest.TestCase):
    def test_pack_original_and_alpha_and_all_routes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'frontend/frames').mkdir(parents=True)
            image = Image.new('RGBA',(1600,1200),(220,170,45,0))
            for x in range(200,1400):
                image.putpixel((x,600),(220,170,45,255))
            image.save(root/'frontend/frames/test.png')
            original = (root/'frontend/frames/test.png').read_bytes()
            for extra in builder.EXTRA:
                (root/extra).mkdir()
                (root/extra/'item.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg"/>')
            (root/'frontend/private.json').write_text('{"secret":"not media"}')
            output = root/'pack'
            index = root/'frontend/apk-content-manifest.json'
            subprocess.run([sys.executable,str(ROOT/'scripts/build-apk-content.py'),'--root',str(root),'--output',str(output),'--web-index',str(index)],check=True,capture_output=True)
            files = json.loads((output/'index.json').read_text())['files']
            self.assertEqual(len(files),4)
            self.assertEqual((root/'frontend/frames/test.png').read_bytes(),original)
            entry = files['frames/test.png']
            self.assertEqual(entry['mime'],'image/webp')
            with Image.open(output/entry['asset']) as packed:
                self.assertEqual(packed.size,(1024,768))
                self.assertEqual(packed.getpixel((0,0))[3],0)
                self.assertGreater(packed.getpixel((512,384))[3],100)
            self.assertEqual(entry['sha256'],json.loads(index.read_text())['files']['frames/test.png'])
            self.assertNotIn('private.json',files)
            self.assertTrue(all(extra+'/item.svg' in files for extra in builder.EXTRA))

    def test_svg_keeps_text_and_optimizes_embedded_png(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);out=root/'pack';out.mkdir()
            buf=io.BytesIO();Image.new('RGBA',(1500,1500),(12,25,31,200)).save(buf,format='PNG')
            svg=b'<svg xmlns="http://www.w3.org/2000/svg"><text>VIP 12</text><image href="data:image/png;base64,'+base64.b64encode(buf.getvalue())+b'"/></svg>'
            path=root/'image.svg';path.write_bytes(svg)
            name,entry,length=builder.pack_one(('image.svg',path),out)
            packed=(out/entry['asset']).read_bytes()
            self.assertIn(b'<text>VIP 12</text>',packed)
            self.assertIn(b'data:image/webp;base64,',packed)
            self.assertEqual(path.read_bytes(),svg)
            self.assertEqual(entry['mime'],'image/svg+xml')

    def test_web_only_needs_no_android_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);(root/'frontend').mkdir()
            (root/'frontend/logo.svg').write_text('<svg/>')
            index=root/'frontend/apk-content-manifest.json'
            subprocess.run([sys.executable,str(ROOT/'scripts/build-apk-content.py'),'--root',str(root),'--web-index',str(index)],check=True,capture_output=True)
            self.assertEqual(json.loads(index.read_text())['schema'],1)
            self.assertEqual(len(json.loads(index.read_text())['files']),1)

if __name__=='__main__':
    unittest.main()
