from pathlib import Path
import unittest
from PIL import Image
class NavAssets(unittest.TestCase):
 def test_complete_transparent_pngs(self):
  for theme in ['light','dark']:
   for name in ['home','messages','explore','games','profile']:
    with self.subTest(theme=theme,name=name):
     p=Path('frontend/assets/lidya-nav-v2')/theme/(name+'.png')
     with Image.open(p) as image:
      self.assertEqual(image.format,'PNG');self.assertIn('A',image.getbands());a=image.getchannel('A');# Ignore nearly invisible antialiasing specks; check the visible silhouette.
      self.assertEqual(a.getpixel((0,0)),0);box=a.point(lambda x:255 if x>32 else 0).getbbox();self.assertIsNotNone(box)
      w,h=image.size;self.assertGreaterEqual(w,256);self.assertGreaterEqual(h,256)
      self.assertGreater(box[0],w*.04);self.assertGreater(box[1],h*.04);self.assertLess(box[2],w*.96);self.assertLess(box[3],h*.96)
if __name__=='__main__':unittest.main()
