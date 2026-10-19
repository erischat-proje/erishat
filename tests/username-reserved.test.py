import importlib.util
from pathlib import Path
import sys
import types
import unittest
root = Path(__file__).resolve().parents[1] / 'backend/app'
package = types.ModuleType('fixture_schemas')
package.__path__ = [str(root)]
sys.modules['fixture_schemas'] = package
spec = importlib.util.spec_from_file_location('fixture_schemas.schemas', root / 'schemas.py')
schemas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schemas)

class ReservedNames(unittest.TestCase):
    def test_reserved_at_every_input(self):
        for name in ['eris','CHAT','ErisChat','eris chat','e.r.i.s','Erİs','ｅｒｉｓ','chat_destek','Eris-Chat123']:
            for cls, data in [(schemas.UserCreate,dict(nickname=name,gender='male')),(schemas.NicknameChange,dict(nickname=name)),(schemas.UserUpdate,dict(nickname=name)),(schemas.OnboardingRequest,dict(username=name,first_name='Kaan',last_name='Altay',birth_date='2000-01-01',gender='male'))]:
                with self.subTest(name=name, model=cls.__name__), self.assertRaises(ValueError):
                    cls(**data)
    def test_normal_name_and_real_name(self):
        self.assertEqual(schemas.NicknameChange(nickname=' Kaan123 ').nickname,'Kaan123')
        self.assertEqual(schemas.UserUpdate(first_name='Eris').first_name,'Eris')

if __name__ == '__main__': unittest.main()
