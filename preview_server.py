#!/usr/bin/env python3
"""Private/local ErisChat preview server.

Run from the repository root:
    python preview_server.py

Then open http://127.0.0.1:8080 in Chrome on the same device.
The server binds only to localhost, so it is not exposed to your network.
"""

from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HOST = "127.0.0.1"
PORT = 8080


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        print(format % args)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), QuietHandler)
    print(f"ErisChat preview: http://{HOST}:{PORT}")
    print("Durdurmak için Ctrl+C")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nPreview kapatıldı.")
    finally:
        server.server_close()
