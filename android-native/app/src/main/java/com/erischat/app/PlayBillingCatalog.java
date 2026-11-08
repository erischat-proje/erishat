package com.erischat.app;

import android.app.Activity;
import android.webkit.WebView;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.android.billingclient.api.Purchase;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.List;

/** Catalog lookup only. Intentionally does NOT initiate payments, acknowledge, consume, or credit. */
public final class PlayBillingCatalog {
    private final Activity activity;
    private final WebView webView;
    private final BillingClient billing;
    private volatile boolean closed = false;

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
        // Billing callbacks may be dispatched on a non-UI thread. WebView calls MUST
        // run on its UI thread; otherwise evaluateJavascript throws and the UI times out.
        activity.runOnUiThread(() -> {
            if (closed || activity.isFinishing() || activity.isDestroyed()) return;
            try {
                String location = webView.getUrl();
                if (location == null) return;
                android.net.Uri uri = android.net.Uri.parse(location);
                String host = uri.getHost();
                if (!"https".equals(uri.getScheme()) ||
                    !("lidyachat.com".equals(host) || "www.lidyachat.com".equals(host))) return;
                JSONObject message = new JSONObject();
                message.put("productId", productId);
                message.put("state", state);
                message.put("detail", detail);
                // Status-only payload. Never expose purchase tokens or personal data.
                String js = "window.dispatchEvent(new CustomEvent('lidyachat:play-catalog',{detail:"
                        + message.toString() + "}));";
                webView.evaluateJavascript(js, null);
            } catch (Exception error) {
                android.util.Log.w("PlayBillingCatalog", "Catalog status delivery failed", error);
            }
        });
    }

    public void query(String productId) {
        if (closed) return;
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
                        report(productId, "unavailable", "Google Play Billing connection unavailable (code " + result.getResponseCode() + ")");
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
                report(productId, "query_failed", "Google Play product lookup failed (code " + result.getResponseCode() + ")");
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

    /** Read-only device purchase reconciliation preview. Never transmit Play tokens to WebView. */
    public void inspectOwned(String productId) {
        if (closed) return;
        if (productId == null || !productId.matches("lidya_0(?:0[1-9]|1[0-6])")) {
            report("", "invalid_product", "Unsupported product identifier");
            return;
        }
        if (!billing.isReady()) {
            billing.startConnection(new BillingClientStateListener() {
                @Override public void onBillingSetupFinished(BillingResult result) {
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) readOwned(productId);
                    else report(productId, "owned_unavailable", "Purchase history unavailable (code " + result.getResponseCode() + ")");
                }
                @Override public void onBillingServiceDisconnected() {
                    report(productId, "owned_unavailable", "Google Play disconnected");
                }
            });
        } else readOwned(productId);
    }

    private void readOwned(String productId) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.INAPP).build();
        billing.queryPurchasesAsync(params, (result, purchases) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                report(productId, "owned_unavailable", "Purchase lookup failed (code " + result.getResponseCode() + ")");
                return;
            }
            int purchased = 0, pending = 0;
            if (purchases != null) for (Purchase purchase : purchases) {
                if (purchase.getProducts() == null || !purchase.getProducts().contains(productId)) continue;
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) purchased++;
                else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) pending++;
            }
            // No purchase token, order ID, or account identifier in bridge payload.
            report(productId, "owned_checked", "completed=" + purchased + ";pending=" + pending);
        });
    }

    public void close() { closed = true; billing.endConnection(); }
}
