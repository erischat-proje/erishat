import com.erischat.app.PlayProductPolicy;

public class PlayProductPolicyTest {

    private static int passed = 0;

    private static void check(
        boolean condition, String name
    ) {
        if (!condition)
            throw new AssertionError(name);

        passed++;
        System.out.println("PASS: " + name);
    }

    public static void main(String[] args) {

        for (int i = 1; i <= 16; i++) {
            String id = String.format(
                java.util.Locale.ROOT,
                "lidya_%03d", i
            );

            check(
                PlayProductPolicy.isKnown(id)
                && PlayProductPolicy.isStandard(id)
                && PlayProductPolicy.canStartLegacyCheckout(id),
                "Standard product " + id
            );
        }

        String[] welcome = {
            "welcome_bronze_v1",
            "welcome_silver_v1",
            "welcome_gold_v1"
        };

        for (String id : welcome) {
            check(
                PlayProductPolicy.isKnown(id)
                && PlayProductPolicy.isWelcome(id)
                && !PlayProductPolicy.canStartLegacyCheckout(id),
                "Welcome isolated checkout " + id
            );

            check(
                PlayProductPolicy.purchaseEvent(id)
                    .equals("lidyachat:welcome-play-purchased"),
                "Welcome event " + id
            );
        }

        String[] rejected = {
            null,
            "",
            "lidya_000",
            "lidya_017",
            "lidya_999",
            "welcome_platinum_v1",
            "welcome_gold_v2",
            "WELCOME_GOLD_V1",
            "welcome_gold_v1 ",
            "welcome_gold_v1<script>"
        };

        for (String id : rejected) {
            check(
                !PlayProductPolicy.isKnown(id)
                && !PlayProductPolicy.canStartLegacyCheckout(id),
                "Reject invalid product " + id
            );
        }

        check(
            PlayProductPolicy.validAccountHash("a".repeat(64)),
            "Valid account hash"
        );

        check(
            !PlayProductPolicy.validAccountHash(null),
            "Missing account hash"
        );

        check(
            !PlayProductPolicy.validAccountHash("a".repeat(63)),
            "Short account hash"
        );

        check(
            !PlayProductPolicy.validAccountHash("G".repeat(64)),
            "Malformed account hash"
        );

        check(
            PlayProductPolicy.purchaseEvent("lidya_001")
                .equals("lidyachat:play-purchased"),
            "Standard purchase event preserved"
        );

        if (passed != 37)
            throw new AssertionError(
                "Unexpected test count: " + passed
            );

        System.out.println(
            "=== ANDROID PRODUCT POLICY: 37/37 PASS ==="
        );
    }
}
