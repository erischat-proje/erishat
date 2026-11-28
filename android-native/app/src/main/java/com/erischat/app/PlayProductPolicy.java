package com.erischat.app;

/** Explicit Play product boundaries. */
public final class PlayProductPolicy {

    private PlayProductPolicy() {}

    public static boolean isStandard(String id) {
        return id != null &&
            id.matches("lidya_0(?:0[1-9]|1[0-6])");
    }

    public static boolean isWelcome(String id) {
        return "welcome_bronze_v1".equals(id)
            || "welcome_silver_v1".equals(id)
            || "welcome_gold_v1".equals(id);
    }

    public static boolean isKnown(String id) {
        return isStandard(id) || isWelcome(id);
    }

    public static boolean validAccountHash(String hash) {
        return hash != null &&
            hash.matches("[a-f0-9]{64}");
    }

    public static boolean canStartLegacyCheckout(String id) {
        return isStandard(id);
    }

    public static String purchaseEvent(String id) {
        if (isWelcome(id))
            return "lidyachat:welcome-play-purchased";

        if (isStandard(id))
            return "lidyachat:play-purchased";

        throw new IllegalArgumentException(
            "Unknown product"
        );
    }
}
