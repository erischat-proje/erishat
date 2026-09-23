import http.server
import urllib.parse
import requests

CLIENT_ID = input("Google Client ID: ").strip()
CLIENT_SECRET = input("Google Client Secret: ").strip()

REDIRECT_URI = "http://127.0.0.1:8765/callback"
SCOPE = "https://www.googleapis.com/auth/gmail.send"

url = (
    "https://accounts.google.com/o/oauth2/v2/auth?"
    + urllib.parse.urlencode({
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent",
    })
)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        params = urllib.parse.parse_qs(
            urllib.parse.urlparse(self.path).query
        )
        code = params.get("code", [None])[0]

        self.send_response(200)
        self.end_headers()

        if not code:
            self.wfile.write(b"OAuth basarisiz.")
            return

        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
                "redirect_uri": REDIRECT_URI,
            },
            timeout=30,
        )

        data = response.json()

        if "refresh_token" in data:
            print("\nREFRESH TOKEN:")
            print(data["refresh_token"])
            print("\nBunu bana GONDERME.")
            print("Railway'a GMAIL_REFRESH_TOKEN olarak ekle.")
        else:
            print("\nOAuth hatasi:")
            print(data)

        self.wfile.write(b"Tamam.")

server = http.server.HTTPServer(
    ("127.0.0.1", 8765),
    Handler,
)

print("\nGoogle yetkilendirme adresi:")
print(url)
print("\nBu adresi tarayicida ac.")
server.handle_request()
