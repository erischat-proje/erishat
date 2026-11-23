package com.erischat.app;

import android.app.Activity;
import android.webkit.WebView;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import java.util.function.BooleanSupplier;

/**
 * TEST ONLY native AdMob rewarded-ad bridge.
 * No wallet mutations, no backend reward call, no production ad-unit ID.
 * Server-side verification MUST be implemented before any real Lidya is awarded.
 */
final class LidyaRewardedAds {
    private static final String TEST_REWARDED_AD_UNIT =
            "ca-app-pub-3940256099942544/5224354917"; // Google's official Android test unit.
    private final Activity activity;
    private final WebView webView;
    private final BooleanSupplier trusted;
    private boolean loading;
    private boolean closed;

    LidyaRewardedAds(Activity activity, WebView webView, BooleanSupplier trusted) {
        this.activity = activity;
        this.webView = webView;
        this.trusted = trusted;
        // Keep Google Mobile Ads initialization off the main thread.
        new Thread(() -> MobileAds.initialize(activity, status -> {}),
                "lidya-ads-init").start();
    }

    void showTestAd() {
        if (closed || loading || !trusted.getAsBoolean()) return;
        loading = true;
        event("loading");
        RewardedAd.load(activity, TEST_REWARDED_AD_UNIT, new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override public void onAdFailedToLoad(LoadAdError error) {
                        loading = false;
                        event("unavailable");
                    }
                    @Override public void onAdLoaded(RewardedAd ad) {
                        loading = false;
                        if (closed || !trusted.getAsBoolean()) return;
                        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override public void onAdDismissedFullScreenContent() {
                                event("closed");
                            }
                            @Override public void onAdFailedToShowFullScreenContent(AdError error) {
                                event("unavailable");
                            }
                        });
                        ad.show(activity, reward -> {
                            // A CLIENT CALLBACK IS NOT PAYMENT PROOF.
                            // Intentionally DO NOT increase Lidya balance here.
                            event("test_completed_no_credit");
                        });
                    }
                });
    }

    private void event(String status) {
        if (closed || !trusted.getAsBoolean()) return;
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent(" +
                "'lidyachat:rewarded-ad',{detail:{status:'" + status + "'}}));", null);
    }

    void close() { closed = true; }
}
