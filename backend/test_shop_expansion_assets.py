"""Missing, duplicated or incorrectly shaped assets must not reach the store."""
import hashlib,json,struct,unittest,re
from PIL import Image
from pathlib import Path
import xml.etree.ElementTree as ET

class ShopAssetTests(unittest.TestCase):
 def test_every_catalog_asset_is_present_distinct_and_correctly_shaped(self):
  root=Path(__file__).resolve().parents[1];data=json.loads((root/'backend/app/shop_expansion.json').read_text());items=data['items']+data['wallpapers'];ready=json.loads((root/'frontend/shop-premium-v2/ready.json').read_text());published={i['asset_key'] for i in ready['items']};self.assertEqual(len(items),811);digests=set()
  for item in items:
   key=item.get('asset') or item['asset_key'];path=root/'frontend'/key
   if key in published and item['type']!='title':path=root/'frontend/shop-premium-v2'/(Path(key).stem+'.webp')
   with self.subTest(asset=key):
    self.assertTrue(path.is_file(),key);raw=path.read_bytes();self.assertGreater(len(raw),300);digest=hashlib.sha256(raw).hexdigest();self.assertNotIn(digest,digests);digests.add(digest)
    if path.suffix=='.png':
     self.assertEqual(raw[:8],b'\x89PNG\r\n\x1a\n');w,h=struct.unpack('>II',raw[16:24]);self.assertGreaterEqual(min(w,h),768)
     if item.get('type')=='avatar':self.assertEqual(w,h)
     else:self.assertAlmostEqual(w/h,9/16,delta=.025)
    elif path.suffix=='.webp':
     with Image.open(path) as im:
      w,h=im.size;self.assertGreaterEqual(min(w,h),640);self.assertEqual(im.mode,'RGBA');expected={'frame':1,'entrance':2,'bubble':2,'profile':2/3}[item['type']];self.assertAlmostEqual(w/h,expected,delta=.035)
      self.assertLess(im.getpixel((0,0))[3],16)
      if item['type']=='frame':
       for px,py in [(w//2,h//2),(int(w*.25),h//2),(int(w*.75),h//2),(w//2,int(h*.25)),(w//2,int(h*.75))]:self.assertLess(im.getpixel((px,py))[3],16,'Avatar opening must remain clear')
    else:
     svg=ET.fromstring(raw);w,h=map(float,svg.attrib['viewBox'].split()[2:]);expected={'frame':1,'entrance':2,'bubble':2,'title':3}[item['type']];self.assertAlmostEqual(w/h,expected,delta=.035)
  self.assertEqual(len(digests),811)
