package com.erischat.app;

import android.app.Activity;
import android.webkit.WebView;
import com.android.billingclient.api.*;
import org.json.JSONObject;
import java.util.Collections;
import java.util.List;

/** Single Play Billing client: catalog, checkout and recovery; backend alone grants entitlements. */
public final class PlayBillingCatalog {
    private final Activity activity;
    private final WebView webView;
    private final BillingClient billing;
    private volatile boolean closed = false;

    public PlayBillingCatalog(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        billing = BillingClient.newBuilder(activity)
            .setListener((result, purchases) -> {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                    for (Purchase purchase : purchases) onPurchase(purchase);
                } else if (result.getResponseCode() != BillingClient.BillingResponseCode.USER_CANCELED) {
                    report("", "purchase_failed", "Google Play error " + result.getResponseCode());
                } else {
                    report("", "cancelled", "Purchase cancelled");
                }
            })
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }

    private void emit(String event, JSONObject detail) {
        activity.runOnUiThread(() -> {
            if (closed || activity.isFinishing() || activity.isDestroyed()) return;
            try {
                android.net.Uri uri = android.net.Uri.parse(webView.getUrl());
                String host = uri.getHost();
                if (!"https".equals(uri.getScheme()) || (uri.getPort() != -1 && uri.getPort() != 443)
                    || !("lidyachat.com".equals(host) || "www.lidyachat.com".equals(host))) return;
                webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('" + event
                   + "',{detail:" + detail.toString() + "}));", null);
            } catch (Exception error) {
                android.util.Log.w("PlayBilling", "Delivery to trusted site failed", error);
            }
        });
    }

    private void report(String productId, String state, String detail) {
        try {
            JSONObject message = new JSONObject();
            message.put("productId", productId);
            message.put("state", state);
            message.put("detail", detail);
            emit("lidyachat:play-catalog", message);
            emit("lidyachat:play-payment-status", message);
        } catch (Exception ignored) { }
    }

    private void connect(Runnable whenReady, String productId) {
        if (closed) return;
        if (billing.isReady()) { whenReady.run(); return; }
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) whenReady.run();
                else report(productId, "unavailable", "Billing error " + result.getResponseCode());
            }
            @Override public void onBillingServiceDisconnected() {
                report(productId, "disconnected", "Billing disconnected");
            }
        });
    }

    private static boolean validProduct(String productId) {
        return PlayProductPolicy.isKnown(productId);
    }

    public void query(String productId) {
        if (!validProduct(productId)) { report("", "invalid_product", "Invalid product"); return; }
        connect(() -> lookup(productId, false, null), productId);
    }

    public void purchase(String productId, String accountHash) {
        if (PlayProductPolicy.isWelcome(productId)) {
            report(productId, "welcome_disabled", "Welcome checkout not enabled");
            return;
        }
        if (!PlayProductPolicy.canStartLegacyCheckout(productId)
                || !PlayProductPolicy.validAccountHash(accountHash)) {
            report(productId, "invalid_account", "Account binding missing"); return;
        }
        final String boundAccount = accountHash;
        connect(() -> lookup(productId, true, boundAccount), productId);
    }

    private void lookup(String productId, boolean startCheckout, final String boundAccount) {
        QueryProductDetailsParams.Product item = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(productId).setProductType(BillingClient.ProductType.INAPP).build();
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(Collections.singletonList(item)).build();
        billing.queryProductDetailsAsync(params, (result, response) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                report(productId, "query_failed", "Product query error " + result.getResponseCode()); return;
            }
            List<ProductDetails> products = response.getProductDetailsList();
            if (products == null || products.isEmpty()) {
                report(productId, "not_available", "Google Play product unavailable"); return;
            }
            if (!startCheckout) { report(productId, "available", "Product found"); return; }
            ProductDetails p = products.get(0);
            List<ProductDetails.OneTimePurchaseOfferDetails> offers = p.getOneTimePurchaseOfferDetailsList();
            ProductDetails.OneTimePurchaseOfferDetails selected = null;
            if (offers != null) for (ProductDetails.OneTimePurchaseOfferDetails offer : offers) {
                if ("standart".equals(offer.getPurchaseOptionId()) && offer.getOfferId() == null) {
                    selected = offer; break;
                }
            }
            if (selected == null) { report(productId, "offer_missing", "Standard offer unavailable"); return; }
            BillingFlowParams.ProductDetailsParams line = BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(p).setOfferToken(selected.getOfferToken()).build();
            BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(line))
                .setObfuscatedAccountId(boundAccount).build();
            activity.runOnUiThread(() -> {
                if (closed || activity.isFinishing() || activity.isDestroyed()) return;
                BillingResult launched = billing.launchBillingFlow(activity, flow);
                if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK)
                    report(productId, "launch_failed", "Play checkout error " + launched.getResponseCode());
            });
        });
    }


    // V10.17: Build validated welcome payment parameters.
    // No welcome billing launch is connected in this stage.

    static BillingFlowParams buildWelcomeFlow(
        WelcomeLaunchAuthorization.Grant grant,
        ProductDetails product
    ) {

        if (grant == null
            || !grant.isFresh()
            || product == null
            || !PlayProductPolicy.isWelcome(grant.productId)
            || !grant.productId.equals(product.getProductId())
            || !BillingClient.ProductType.INAPP.equals(
                product.getProductType()))
            return null;

        List<ProductDetails.OneTimePurchaseOfferDetails>
            offers = product.getOneTimePurchaseOfferDetailsList();

        if (offers == null)
            return null;

        ProductDetails.OneTimePurchaseOfferDetails
            selected = null;

        for (ProductDetails.OneTimePurchaseOfferDetails
                offer : offers) {

            if (!"standart".equals(
                    offer.getPurchaseOptionId())
                || offer.getOfferId() != null)
                continue;

            if (selected != null)
                return null;

            selected = offer;
        }

        if (selected == null)
            return null;

        if (!WelcomeLaunchPolicy.matchesPlayPrice(
            grant.currency,
            grant.priceMicros,
            selected.getPriceCurrencyCode(),
            selected.getPriceAmountMicros()
        )) return null;

        String offerToken = selected.getOfferToken();

        if (offerToken == null || offerToken.isEmpty())
            return null;

        BillingFlowParams.ProductDetailsParams line =
            BillingFlowParams.ProductDetailsParams
                .newBuilder()
                .setProductDetails(product)
                .setOfferToken(offerToken)
                .build();

        return BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(
                Collections.singletonList(line)
            )
            .setObfuscatedAccountId(grant.accountHash)
            .build();
    }

    private void onPurchase(Purchase purchase) {
        if (purchase.getProducts() == null || purchase.getProducts().size() != 1) return;
        String product = purchase.getProducts().get(0);
        if (!validProduct(product)) return;
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            report(product, "pending", "Payment pending"); return;
        }
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) return;
        try {
            JSONObject detail = new JSONObject();
            detail.put("productId", product);
            detail.put("purchaseToken", purchase.getPurchaseToken());
            // Token is transmitted only to the pinned trusted website's JS for authenticated server verification.
            emit(PlayProductPolicy.purchaseEvent(product), detail);
        } catch (Exception ignored) { }
    }


    public void recover() {
        recoverProducts(false);
    }

    public void recoverWelcome() {
        recoverProducts(true);
    }

    private void recoverProducts(boolean welcomeOnly) {
        connect(() -> {
            QueryPurchasesParams params =
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build();

            billing.queryPurchasesAsync(
                params,
                (result, purchases) -> {

                    if (closed ||
                        result.getResponseCode() !=
                            BillingClient.BillingResponseCode.OK
                        || purchases == null)
                        return;

                    for (Purchase purchase : purchases) {

                        if (purchase.getProducts() == null ||
                            purchase.getProducts().size() != 1)
                            continue;

                        String product =
                            purchase.getProducts().get(0);

                        boolean allowed = welcomeOnly
                            ? PlayProductPolicy.isWelcome(product)
                            : PlayProductPolicy.isStandard(product);

                        if (allowed)
                            onPurchase(purchase);
                    }
                }
            );
        }, "");
    }

    public void close() { closed = true; billing.endConnection(); }
}
