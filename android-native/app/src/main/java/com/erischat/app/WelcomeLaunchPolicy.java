package com.erischat.app;

import java.util.UUID;

public final class WelcomeLaunchPolicy {

    private WelcomeLaunchPolicy() {}

    public static boolean validRequest(String id) {
        return id != null &&
            id.matches("[a-f0-9]{32}");
    }

    public static boolean validUuid(String id) {
        if (id == null) return false;

        try {
            return UUID.fromString(id)
                .toString().equals(id);

        } catch (IllegalArgumentException error) {
            return false;
        }
    }

    public static boolean validBinding(
        String requestedProduct,
        String requestedId,
        String product,
        String tier,
        String requestId,
        String accountHash,
        String permitId,
        String intentId
    ) {
        return PlayProductPolicy.isWelcome(requestedProduct)
            && requestedProduct.equals(product)
            && PlayProductPolicy.welcomeTier(product).equals(tier)
            && validRequest(requestedId)
            && requestedId.equals(requestId)
            && PlayProductPolicy.validAccountHash(accountHash)
            && validUuid(permitId)
            && validUuid(intentId);
    }

    public static boolean validWindow(
        long nowMillis,
        long expiresMillis
    ) {
        return expiresMillis > nowMillis
            && expiresMillis - nowMillis <= 90000L;
    }

    public static boolean validServerPrice(
        String currency,
        int priceKurus,
        long priceMicros
    ) {
        return "TRY".equals(currency)
            && priceKurus > 0
            && priceMicros == priceKurus * 10000L;
    }

    public static boolean matchesPlayPrice(
        String expectedCurrency,
        long expectedMicros,
        String playCurrency,
        long playMicros
    ) {
        return "TRY".equals(expectedCurrency)
            && expectedCurrency.equals(playCurrency)
            && expectedMicros > 0
            && expectedMicros == playMicros;
    }
}
