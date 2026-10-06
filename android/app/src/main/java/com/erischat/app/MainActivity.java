package com.erischat.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.util.concurrent.Executor;

import androidx.credentials.CredentialManager;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.security.SecureRandom;

public class MainActivity extends Activity {

    private static final String ERISCHAT_URL =
            "https://erischat-web-v2-production.up.railway.app/";

    private static final String GOOGLE_WEB_CLIENT_ID =
            "599316709150-ngekrq0sg5g70pvjqkamrbvba6qq7qdd.apps.googleusercontent.com";

    private WebView webView;
    private CredentialManager credentialManager;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        credentialManager = CredentialManager.create(this);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setSupportMultipleWindows(false);
        settings.setUserAgentString(
                settings.getUserAgentString() + " ErisChatAndroid/1.0"
        );

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new ErisNativeBridge(), "ErisNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view,
                    WebResourceRequest request
            ) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient());

        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        if (savedInstanceState == null) {
            webView.loadUrl(ERISCHAT_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private String generateNonce() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.encodeToString(
                bytes,
                Base64.NO_WRAP | Base64.URL_SAFE | Base64.NO_PADDING
        );
    }

    private void startNativeGoogleSignIn() {
        final String nonce = generateNonce();

        GetSignInWithGoogleOption googleOption =
                new GetSignInWithGoogleOption.Builder(
                        GOOGLE_WEB_CLIENT_ID
                )
                        .setNonce(nonce)
                        .build();

        GetCredentialRequest request =
                new GetCredentialRequest.Builder()
                        .addCredentialOption(googleOption)
                        .build();

        Executor executor = getMainExecutor();

        credentialManager.getCredentialAsync(
                this,
                request,
                new CancellationSignal(),
                executor,
                new CredentialManagerCallback<
                        GetCredentialResponse,
                        GetCredentialException
                >() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        if (result.getCredential() instanceof CustomCredential) {
                            CustomCredential credential =
                                    (CustomCredential) result.getCredential();

                            if (GoogleIdTokenCredential
                                    .TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                                    .equals(credential.getType())) {

                                try {
                                    GoogleIdTokenCredential googleCredential =
                                            GoogleIdTokenCredential.createFrom(
                                                    credential.getData()
                                            );

                                    String idToken =
                                            googleCredential.getIdToken();

                                    sendGoogleTokenToWebView(idToken);
                                    return;

                                } catch (Exception e) {
                                    sendNativeError(
                                            e.getMessage() != null
                                                    ? e.getMessage()
                                                    : "Google kimlik bilgisi okunamadı."
                                    );
                                    return;
                                }
                            }
                        }

                        sendNativeError(
                                "Google kimlik bilgisi alınamadı."
                        );
                    }

                    @Override
                    public void onError(GetCredentialException e) {
                        String message = e.getMessage();

                        if (message == null || message.trim().isEmpty()) {
                            message = "Google girişi başarısız.";
                        }

                        sendNativeError(message);
                    }
                }
        );
    }

    private void sendGoogleTokenToWebView(String idToken) {
        if (webView == null || idToken == null || idToken.isEmpty()) {
            return;
        }

        String escapedToken =
                org.json.JSONObject.quote(idToken);

        String javascript =
                "window.ErisAuthNativeGoogleSuccess && " +
                "window.ErisAuthNativeGoogleSuccess(" +
                escapedToken +
                ");";

        webView.post(() ->
                webView.evaluateJavascript(javascript, null)
        );
    }

    private void sendNativeError(String message) {
        if (webView == null) {
            return;
        }

        String escapedMessage =
                org.json.JSONObject.quote(message);

        String javascript =
                "window.ErisAuthNativeGoogleError && " +
                "window.ErisAuthNativeGoogleError(" +
                escapedMessage +
                ");";

        runOnUiThread(() ->
                webView.evaluateJavascript(javascript, null)
        );
    }

    private class ErisNativeBridge {

        @JavascriptInterface
        public void googleSignIn() {
            runOnUiThread(() -> startNativeGoogleSignIn());
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
        }

        super.onDestroy();
    }
}
