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

    // Welcome commercial launch remains locked.
    private static final boolean
        WELCOME_NATIVE_LAUNCH_ENABLED = false;

    private final PaymentFlowGate paymentGate =
        new PaymentFlowGate();

    private final android.os.Handler paymentHandler =
        new android.os.Handler(
            android.os.Looper.getMainLooper()
        );


    public PlayBillingCatalog(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        billing = BillingClient.newBuilder(activity)
            .setListener((result, purchases) -> {

                if (purchases != null &&
                    !purchases.isEmpty()) {

                    for (Purchase purchase : purchases) {

                        if (purchase.getProducts() != null &&
                            purchase.getProducts().size() == 1) {

                            paymentGate.finishCallback(
                                purchase.getProducts().get(0),
                                false
                            );
                        }
                    }

                } else if (
                    result.getResponseCode() !=
                        BillingClient.BillingResponseCode.OK
                ) {

                    paymentGate.finishCallback(null, true);
                }

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
        connect(() -> lookup(productId, false, null, null, () -> true), productId);
    }


    private PaymentFlowGate.Ticket acquirePayment(
        String productId
    ) {

        if (closed)
            return null;

        PaymentFlowGate.Ticket ticket =
            paymentGate.acquire(productId);

        if (ticket == null) {

            report(
                productId,
                "payment_busy",
                "Another payment is active"
            );

            return null;
        }

        paymentHandler.postDelayed(() -> {

            if (paymentGate.abortPreparing(ticket)) {

                report(
                    productId,
                    "preparation_timeout",
                    "Payment preparation expired"
                );
            }

        }, 30000L);

        return ticket;
    }

    private void failPreparation(
        PaymentFlowGate.Ticket ticket,
        String productId,
        String state
    ) {

        if (ticket == null ||
            paymentGate.abortPreparing(ticket)) {

            report(
                productId,
                state,
                "Payment preparation unavailable"
            );
        }
    }

    public void purchase(
        String productId,
        String accountHash,
        java.util.function.BooleanSupplier allowed
    ) {

        if (!PlayProductPolicy.canStartLegacyCheckout(
                productId)
            || !PlayProductPolicy.validAccountHash(
                accountHash)) {

            report(
                productId,
                "invalid_account",
                "Invalid product or account"
            );

            return;
        }

        PaymentFlowGate.Ticket ticket =
            acquirePayment(productId);

        if (ticket == null)
            return;

        connect(
            () -> lookup(
                productId,
                true,
                accountHash,
                ticket,
                allowed
            ),
            productId
        );
    }

    private void lookup(
        String productId,
        boolean startCheckout,
        String boundAccount,
        PaymentFlowGate.Ticket ticket,
        java.util.function.BooleanSupplier allowed
    ) {

        if (closed ||
            (startCheckout &&
             !paymentGate.isPreparing(ticket)))
            return;

        QueryProductDetailsParams.Product item =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        QueryProductDetailsParams params =
            QueryProductDetailsParams.newBuilder()
                .setProductList(
                    Collections.singletonList(item)
                ).build();

        billing.queryProductDetailsAsync(
            params,
            (result, response) -> {

                if (closed ||
                    (startCheckout &&
                     !paymentGate.isPreparing(ticket)))
                    return;

                if (result.getResponseCode() !=
                        BillingClient.BillingResponseCode.OK) {

                    failPreparation(
                        ticket, productId, "query_failed"
                    );

                    return;
                }

                List<ProductDetails> products =
                    response.getProductDetailsList();

                if (products == null ||
                    products.size() != 1 ||
                    !productId.equals(
                        products.get(0).getProductId())) {

                    failPreparation(
                        ticket, productId, "not_available"
                    );

                    return;
                }

                if (!startCheckout) {

                    report(
                        productId, "available", "Product found"
                    );

                    return;
                }

                try {

                    ProductDetails p = products.get(0);

                    List<ProductDetails.OneTimePurchaseOfferDetails>
                        offers = p.getOneTimePurchaseOfferDetailsList();

                    ProductDetails.OneTimePurchaseOfferDetails
                        selected = null;

                    if (offers != null) {

                        for (ProductDetails.OneTimePurchaseOfferDetails
                                offer : offers) {

                            if ("standart".equals(
                                    offer.getPurchaseOptionId())
                                && offer.getOfferId() == null) {

                                selected = offer;
                                break;
                            }
                        }
                    }

                    if (selected == null) {

                        failPreparation(
                            ticket, productId, "offer_missing"
                        );

                        return;
                    }

                    BillingFlowParams.ProductDetailsParams line =
                        BillingFlowParams.ProductDetailsParams
                            .newBuilder()
                            .setProductDetails(p)
                            .setOfferToken(
                                selected.getOfferToken()
                            ).build();

                    BillingFlowParams flow =
                        BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(
                                Collections.singletonList(line)
                            )
                            .setObfuscatedAccountId(boundAccount)
                            .build();

                    activity.runOnUiThread(() ->
                        launchLocked(
                            ticket, flow, allowed, null
                        )
                    );

                } catch (RuntimeException error) {

                    failPreparation(
                        ticket, productId, "invalid_offer"
                    );
                }
            }
        );
    }

    private void launchLocked(
        PaymentFlowGate.Ticket ticket,
        BillingFlowParams flow,
        java.util.function.BooleanSupplier allowed,
        WelcomeLaunchAuthorization.Grant grant
    ) {

        if (!paymentGate.isPreparing(ticket))
            return;

        if (closed || activity.isFinishing()
            || activity.isDestroyed()
            || allowed == null
            || !allowed.getAsBoolean()
            || flow == null) {

            paymentGate.abortPreparing(ticket);
            return;
        }

        if (PlayProductPolicy.isWelcome(ticket.productId)) {

            if (!WELCOME_NATIVE_LAUNCH_ENABLED ||
                grant == null ||
                !ticket.productId.equals(grant.productId) ||
                !grant.claim()) {

                failPreparation(
                    ticket,
                    ticket.productId,
                    "welcome_disabled"
                );

                return;
            }
        }

        if (!paymentGate.markLaunched(ticket))
            return;

        try {

            BillingResult result =
                billing.launchBillingFlow(activity, flow);

            if (result.getResponseCode() !=
                    BillingClient.BillingResponseCode.OK) {

                paymentGate.launchRejected(ticket);

                report(
                    ticket.productId,
                    "launch_failed",
                    "Google Play launch rejected"
                );
            }

        } catch (RuntimeException ignored) {

            // An uncertain launch must not permit a second
            // payment automatically.

            report(
                ticket.productId,
                "payment_unknown",
                "Payment status must be checked"
            );
        }
    }

    // Internal welcome checkout engine.
    // Not exposed to JavaScript in this stage.

    void purchaseWelcome(
        String productId,
        String accessToken,
        String requestId,
        java.util.function.BooleanSupplier allowed
    ) {

        if (!WELCOME_NATIVE_LAUNCH_ENABLED ||
            !PlayProductPolicy.isWelcome(productId) ||
            !PlayProductPolicy.validSessionToken(accessToken) ||
            !WelcomeLaunchPolicy.validRequest(requestId)) {

            report(
                productId,
                "welcome_disabled",
                "Welcome checkout disabled"
            );

            return;
        }

        PaymentFlowGate.Ticket ticket =
            acquirePayment(productId);

        if (ticket == null)
            return;

        new Thread(() -> {

            WelcomeLaunchAuthorization.Grant grant =
                WelcomeLaunchAuthorization.authorize(
                    productId, accessToken, requestId
                );

            activity.runOnUiThread(() -> {

                if (!paymentGate.isPreparing(ticket))
                    return;

                if (grant == null ||
                    !grant.isFresh() ||
                    allowed == null ||
                    !allowed.getAsBoolean()) {

                    failPreparation(
                        ticket,
                        productId,
                        "authorization_failed"
                    );

                    return;
                }

                connect(
                    () -> lookupWelcome(ticket, grant, allowed),
                    productId
                );
            });

        }, "LidyaWelcomeAuthorization").start();
    }

    private void lookupWelcome(
        PaymentFlowGate.Ticket ticket,
        WelcomeLaunchAuthorization.Grant grant,
        java.util.function.BooleanSupplier allowed
    ) {

        if (!paymentGate.isPreparing(ticket))
            return;

        QueryProductDetailsParams.Product item =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(ticket.productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        QueryProductDetailsParams params =
            QueryProductDetailsParams.newBuilder()
                .setProductList(
                    Collections.singletonList(item)
                ).build();

        billing.queryProductDetailsAsync(
            params,
            (result, response) -> {

                if (!paymentGate.isPreparing(ticket))
                    return;

                try {

                    List<ProductDetails> products =
                        response.getProductDetailsList();

                    if (result.getResponseCode() !=
                            BillingClient.BillingResponseCode.OK
                        || products == null
                        || products.size() != 1) {

                        failPreparation(
                            ticket,
                            ticket.productId,
                            "not_available"
                        );

                        return;
                    }

                    BillingFlowParams flow =
                        buildWelcomeFlow(
                            grant, products.get(0)
                        );

                    if (flow == null) {

                        failPreparation(
                            ticket,
                            ticket.productId,
                            "price_or_offer_mismatch"
                        );

                        return;
                    }

                    activity.runOnUiThread(() ->
                        launchLocked(
                            ticket, flow, allowed, grant
                        )
                    );

                } catch (RuntimeException ignored) {

                    failPreparation(
                        ticket,
                        ticket.productId,
                        "invalid_offer"
                    );
                }
            }
        );
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

    public void close() {
        closed = true;
        paymentHandler.removeCallbacksAndMessages(null);
        billing.endConnection();
    }
}
