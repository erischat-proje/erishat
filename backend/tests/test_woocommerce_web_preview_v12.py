from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
JS=(ROOT/'frontend/payment-assistance.js').read_text(encoding='utf-8')
HTML=(ROOT/'frontend/erischat-main.html').read_text(encoding='utf-8')
PREVIEW=JS.split('// WOOCOMMERCE_WEB_PREVIEW_V12',1)[1].split('// One consolidated Play checkout bridge;',1)[0]
class WebPreviewV12(unittest.TestCase):
 def test_preview_present(self):self.assertIn('async function choose(p)',PREVIEW)
 def test_uses_authenticated_prepare(self):
  self.assertIn('/woocommerce/web-checkout/prepare',PREVIEW)
  self.assertIn('Authorization:',PREVIEW)
 def test_only_read_only_prepare(self):
  self.assertNotIn("api('/requests'",PREVIEW)
  self.assertNotIn('/web-orders',PREVIEW)
  self.assertNotIn('window.location',PREVIEW)
  self.assertNotIn('set_paid',PREVIEW)
 def test_payment_disabled(self):
  self.assertIn('actionButton.disabled=true',PREVIEW)
  self.assertIn('data.payment_available!==false',PREVIEW)
 def test_server_pricing(self):
  self.assertIn('data.selection',PREVIEW)
  self.assertIn('item.price_try',PREVIEW)
 def test_android_guard(self):self.assertIn('window.ErisChatAndroid?.queryPlayCatalog',PREVIEW)
 def test_script_version(self):self.assertIn('payment-assistance.js?v=woocommerce-web-preview-v12-20261120',HTML)
if __name__=='__main__':unittest.main()
