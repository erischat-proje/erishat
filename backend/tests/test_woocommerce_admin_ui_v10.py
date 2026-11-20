"""Source-level safety/registration checks for a frontend-only V10 feature."""
from pathlib import Path
import unittest
R=Path(__file__).resolve().parents[2]
read=lambda p:(R/p).read_text(encoding='utf-8')
class WooCommerceV10UI(unittest.TestCase):
 def test_tools_da_only(self):
  self.assertIn("('lm-woocommerce','WooCommerce Siparişleri','Mali yönetim',DA,",read('backend/app/admin_workspace.py'))
 def test_visible_menu_button(self):
  self.assertIn('data-a="lm-woocommerce"',read('frontend/admin-live.js'))
 def test_route_registered(self):
  s=read('frontend/management-center.js')
  self.assertIn("woocommerce:'WooCommerce Siparişleri'",s)
  self.assertIn("kind==='woocommerce')await wooOrders(options)",s)
 def test_role_gate(self):
  s=read('frontend/management-center.js')
  self.assertIn("async function wooOrders(options={}){\n if(!isDA())",s)
  self.assertIn("async function wooOrderAudit(ref,options={}){\n if(!isDA())",s)
 def test_read_only_api(self):
  s=read('frontend/management-center.js')
  snippet=s[s.index('async function wooOrders(options={})'):s.index('function help(){reset(')]
  self.assertIn("get('/v1/admin/woocommerce/orders?'",snippet)
  self.assertIn("+'/audit'",snippet)
  for v in ('post(',"method:'POST'",'user.lidya','set_paid',"fetch('"):
   self.assertNotIn(v,snippet)
 def test_page_size(self):
  self.assertIn("limit:'20'",read('frontend/management-center.js'))
 def test_no_success_claim(self):
  self.assertIn('Ödeme doğrulanmadı',read('frontend/management-center.js'))
 def test_css_loaded(self):
  self.assertIn('woocommerce-admin-ui-v10.css',read('frontend/erischat-main.html'))
 def test_backend_still_da(self):
  self.assertIn("role.role != 'DA'",read('backend/app/woocommerce_admin_audit_v9.py'))
 def test_v6_opt_in_unchanged(self):
  self.assertIn('woocommerce_order_creation_enabled: bool = False',read('backend/app/config.py'))
if __name__=='__main__': unittest.main()
