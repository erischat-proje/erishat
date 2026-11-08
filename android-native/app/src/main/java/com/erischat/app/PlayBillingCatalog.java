package com.erischat.app;

import android.app.Activity;
import android.webkit.WebView;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.QueryProductDetailsParams;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.List;

/** Catalog lookup only. Intentionally does NOT initiate payments, acknowledge, consume, or credit. */
public final class PlayBillingCatalog {
    private final Activity activity;
    private final WebView webView;
    private final BillingClient billing;

    public PlayBillingCatalog(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        billing = BillingClient.newBuilder(activity)
                .setListener((result, purchases) -> { /* No purchase flow is offered in this release. */ })
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    private void report(String productId, String state, String detail) {
        try {
            JSONObject message = new JSONObject();
            message.put("productId", productId);
            message.put("state", state);
            message.put("detail", detail);
            // The message contains catalog status only, never a purchase token or personal information.
            String js = "window.dispatchEvent(new CustomEvent('lidyachat:play-catalog',{detail:"
                    + message.toString() + "}));";
            webView.evaluateJavascript(js, null);
        } catch (Exception ignored) { }
    }

    public void query(String productId) {
        if (!productId.matches("lidya_0(?:0[1-9]|1[0-6])")) {
            report("", "invalid_product", "Unsupported product identifier");
            return;
        }
        if (!billing.isReady()) {
            billing.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        fetch(productId);
                    } else {
                        report(productId, "unavailable", "Google Play Billing connection unavailable");
                    }
                }
                @Override public void onBillingServiceDisconnected() {
                    report(productId, "disconnected", "Google Play Billing disconnected");
                }
            });
        } else {
            fetch(productId);
        }
    }

    private void fetch(String productId) {
        QueryProductDetailsParams.Product product = QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(product))
                .build();
        billing.queryProductDetailsAsync(params, (result, response) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                report(productId, "query_failed", "Google Play product lookup failed");
                return;
            }
            List<ProductDetails> products = response.getProductDetailsList();
            if (products == null || products.isEmpty()) {
                report(productId, "not_available", "Product unavailable for current Play account or region");
                return;
            }
            report(productId, "available", "Google Play recognizes this product. Payment is disabled in this build.");
        });
    }

    public void close() { billing.endConnection(); }
}
