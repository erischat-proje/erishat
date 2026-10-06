package com.erischat.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;

public class MainActivity extends Activity {

    private static final String ERISCHAT_URL =
            "https://erischat-production-850f.up.railway.app/";

    /*
     * ID token audience.
     * Backend /v1/auth/google bu Web OAuth Client ID'yi doğruluyor.
     */
    private static final String SERVER_CLIENT_ID =
            "599316709150-ngekrq0sg5g70pvjqkamrbvba6qq7qdd.apps.googleusercontent.com";

    private static final int GOOGLE_SIGN_IN = 9001;

    private WebView webView;
    private GoogleSignInClient googleClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        GoogleSignInOptions options =
                new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                        .requestIdToken(SERVER_CLIENT_ID)
                        .requestEmail()
                        .build();

        googleClient = GoogleSignIn.getClient(this, options);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        settings.setUserAgentString(
                settings.getUserAgentString() + " ErisChatAndroid/2.0"
        );

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(
                new AndroidBridge(),
                "ErisChatAndroid"
        );

        webView.setWebViewClient(new WebViewClient());

        webView.loadUrl(ERISCHAT_URL);
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void googleSignIn() {
            runOnUiThread(() -> {
                Intent intent = googleClient.getSignInIntent();
                startActivityForResult(intent, GOOGLE_SIGN_IN);
            });
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != GOOGLE_SIGN_IN) return;

        try {
            GoogleSignInAccount account =
                    GoogleSignIn.getSignedInAccountFromIntent(data)
                            .getResult(ApiException.class);

            String token = account.getIdToken();

            if (token == null) {
                sendGoogleError("Google ID token alınamadı.");
                return;
            }

            sendGoogleToken(token);

        } catch (ApiException e) {
            sendGoogleError(
                    "Google giriş hatası (" + e.getStatusCode() + ")"
            );
        }
    }

    private void sendGoogleToken(String token) {
        String js =
                "window.dispatchEvent(new CustomEvent(" +
                "'erischat:native-google-token'," +
                "{detail:{credential:" + quote(token) + "}}));";

        webView.evaluateJavascript(js, null);
    }

    private void sendGoogleError(String message) {
        String js =
                "window.dispatchEvent(new CustomEvent(" +
                "'erischat:native-google-error'," +
                "{detail:{message:" + quote(message) + "}}));";

        webView.evaluateJavascript(js, null);
    }

    private String quote(String value) {
        return "\"" +
                value.replace("\\", "\\\\")
                     .replace("\"", "\\\"")
                     .replace("\n", "\\n")
                     .replace("\r", "\\r") +
                "\"";
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
