"""Missing, duplicated or incorrectly shaped assets must not reach the store."""
import hashlib,json,struct,unittest
from pathlib import Path
import xml.etree.ElementTree as ET

class ShopAssetTests(unittest.TestCase):
 def test_every_catalog_asset_is_present_distinct_and_correctly_shaped(self):
  root=Path(__file__).resolve().parents[1];data=json.loads((root/'backend/app/shop_expansion.json').read_text());items=data['items']+data['wallpapers'];self.assertEqual(len(items),800);digests=set()
  for item in items:
   key=item.get('asset') or item['asset_key'];path=root/'frontend'/key
   with self.subTest(asset=key):
    self.assertTrue(path.is_file(),key);raw=path.read_bytes();self.assertGreater(len(raw),300);digest=hashlib.sha256(raw).hexdigest();self.assertNotIn(digest,digests);digests.add(digest)
    if path.suffix=='.png':
     self.assertEqual(raw[:8],b'\x89PNG\r\n\x1a\n');w,h=struct.unpack('>II',raw[16:24]);self.assertGreaterEqual(min(w,h),768)
     if item.get('type')=='avatar':self.assertEqual(w,h)
     else:self.assertAlmostEqual(w/h,9/16,delta=.025)
    else:
     svg=ET.fromstring(raw);w,h=map(float,svg.attrib['viewBox'].split()[2:]);expected={'frame':1,'entrance':2,'bubble':2,'title':800/180}[item['type']];self.assertAlmostEqual(w/h,expected)
  self.assertEqual(len(digests),800)
