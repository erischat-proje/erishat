import ast
import asyncio
import unittest
from pathlib import Path

source=ast.parse(Path('backend/app/main.py').read_text())
selected=[node for node in source.body if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)) and node.name in {'_valid_room_rtc_payload','_cleanup_disconnected_room_seat'}]
namespace={}
exec(compile(ast.Module(body=selected,type_ignores=[]),'rtc_helpers','exec'),namespace)
valid=namespace['_valid_room_rtc_payload']
class RTCBackendTests(unittest.IsolatedAsyncioTestCase):
    def test_payload_validation(self):
        self.assertTrue(valid('rtc_offer',{'type':'offer','sdp':'v=0'}))
        self.assertTrue(valid('rtc_answer',{'type':'answer','sdp':'v=0'}))
        self.assertFalse(valid('rtc_offer',{'type':'answer','sdp':'v=0'}))
        self.assertFalse(valid('rtc_offer',{'type':'offer','sdp':'x'*65537}))
        self.assertFalse(valid('rtc_offer',None))
        self.assertTrue(valid('rtc_ice',{'candidate':'candidate:1'}))
        self.assertFalse(valid('rtc_ice',{'candidate':'x'*4097}))
        self.assertFalse(valid('rtc_reconnect',{'reset':'yes'}))
        self.assertTrue(valid('rtc_reconnect',{'reset':True}))
        self.assertTrue(valid('rtc_leave',None))
        self.assertFalse(valid('unknown',{}))
    async def test_reconnect_preserves_seat(self):
        calls=[]
        async def sleep(seconds):calls.append(seconds)
        class Clock:pass
        clock=Clock();clock.sleep=sleep
        namespace.update(asyncio=clock,room_socket_users={'new':('room','user')})
        await namespace['_cleanup_disconnected_room_seat']('room','user')
        self.assertEqual(calls,[35])
    async def test_departed_user_seat_clears(self):
        calls=[]
        async def sleep(seconds):pass
        async def worker(fn,*args):calls.append(args)
        class Clock:pass
        clock=Clock();clock.sleep=sleep
        namespace.update(asyncio=clock,room_socket_users={},run_in_threadpool=worker,_clear_disconnected_room_seat=lambda *x:None)
        await namespace['_cleanup_disconnected_room_seat']('room','user')
        self.assertEqual(calls,[('room','user')])
if __name__=='__main__':unittest.main()
