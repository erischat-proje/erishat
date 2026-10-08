package com.erischat.app;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.graphics.Bitmap;
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

    private static final String ERISCHAT_HOST = "erischat-production-850f.up.railway.app";
    private static final String ERISCHAT_URL = "https://" + ERISCHAT_HOST + "/";

    /*
     * ID token audience.
     * Backend /v1/auth/google bu Web OAuth Client ID'yi doğruluyor.
     */
    private static final String SERVER_CLIENT_ID =
            "599316709150-ngekrq0sg5g70pvjqkamrbvba6qq7qdd.apps.googleusercontent.com";

    private static final int GOOGLE_SIGN_IN = 9001;
    private static final int MICROPHONE_PERMISSION = 9002;
    private PermissionRequest pendingMicrophone;
    private boolean microphoneDialogOpen;
    private int pageGeneration;
    private int permissionPageGeneration;

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

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleMicrophoneRequest(request));
            }
            @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                runOnUiThread(() -> {
                    if (pendingMicrophone == request) pendingMicrophone = null;
                });
            }
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                pageGeneration++;
                denyPendingMicrophone();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (trustedOrigin(uri)) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (RuntimeException ignored) {}
                }
                return true;
            }
        });

        webView.loadUrl(ERISCHAT_URL);
    }

    public class AndroidBridge {
        @JavascriptInterface
        public void googleSignIn() {
            runOnUiThread(() -> {
                if (!trustedPage()) return;
                // Clear Google's cached choice so another account can be selected.
                googleClient.signOut().addOnCompleteListener(task -> {
                    if (isFinishing() || isDestroyed() || !trustedPage()) return;
                    Intent intent = googleClient.getSignInIntent();
                    startActivityForResult(intent, GOOGLE_SIGN_IN);
                });
            });
        }
    }

    private static boolean trustedOrigin(Uri uri) {
        return uri != null && "https".equals(uri.getScheme())
                && (uri.getPort() == -1 || uri.getPort() == 443)
                && uri.getUserInfo() == null
                && ERISCHAT_HOST.equals(uri.getHost());
    }

    private boolean trustedPage() {
        return webView != null && webView.getUrl() != null
                && trustedOrigin(Uri.parse(webView.getUrl()));
    }

    private void denyPendingMicrophone() {
        PermissionRequest request = pendingMicrophone;
        pendingMicrophone = null;
        if (request != null) request.deny();
    }

    private void handleMicrophoneRequest(PermissionRequest request) {
        if (isFinishing() || isDestroyed() || !trustedPage()
                || !trustedOrigin(request.getOrigin())) {
            request.deny(); return;
        }
        boolean audio = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) audio = true;
        }
        if (!audio || pendingMicrophone != null || microphoneDialogOpen) {
            request.deny(); return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            return;
        }
        pendingMicrophone = request;
        permissionPageGeneration = pageGeneration;
        microphoneDialogOpen = true;
        try {
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION);
        } catch (RuntimeException error) {
            microphoneDialogOpen = false;
            denyPendingMicrophone();
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != MICROPHONE_PERMISSION) return;
        microphoneDialogOpen = false;
        PermissionRequest request = pendingMicrophone;
        pendingMicrophone = null;
        if (request == null) return;
        boolean allowed = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        if (allowed && permissionPageGeneration == pageGeneration && trustedPage()
                && trustedOrigin(request.getOrigin()) && !isFinishing() && !isDestroyed()) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
        }
    }

    @Override
    protected void onActivityResult(
            int requestCode,
            int resultCode,
            Intent data
    ) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != GOOGLE_SIGN_IN || !trustedPage()) return;
        if (resultCode != RESULT_OK || data == null) {
            sendGoogleError("Google giriş işlemi iptal edildi.");
            return;
        }

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

    @Override protected void onDestroy() {
        denyPendingMicrophone();
        if (webView != null) {
            webView.removeJavascriptInterface("ErisChatAndroid");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
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
