import com.erischat.app.PlayProductPolicy;

public class WelcomeCheckoutPolicyTest {

    private static int passed = 0;

    private static void check(
        boolean value, String name
    ) {
        if (!value)
            throw new AssertionError(name);

        passed++;
        System.out.println("PASS: " + name);
    }

    public static void main(String[] args) {

        for (String tier :
            new String[]{"bronze","silver","gold"}) {

            check(
                tier.equals(
                    PlayProductPolicy.welcomeTier(
                        "welcome_" + tier + "_v1"
                    )
                ),
                "Exact tier mapping: " + tier
            );
        }

        check(
            PlayProductPolicy.welcomeTier("lidya_001") == null,
            "Standard product isolated"
        );

        check(
            PlayProductPolicy.welcomeTier("welcome_fake_v1") == null,
            "Unknown welcome product rejected"
        );

        check(
            PlayProductPolicy.welcomeTier(null) == null,
            "Missing product rejected"
        );

        check(
            PlayProductPolicy.validSessionToken("a".repeat(64)),
            "Valid session token"
        );

        check(
            !PlayProductPolicy.validSessionToken(null),
            "Missing session rejected"
        );

        check(
            !PlayProductPolicy.validSessionToken("a".repeat(31)),
            "Short session rejected"
        );

        check(
            !PlayProductPolicy.validSessionToken("a".repeat(513)),
            "Oversized session rejected"
        );

        check(
            !PlayProductPolicy.validSessionToken(
                "a".repeat(64) + "\r\n"
            ),
            "Header injection rejected"
        );

        check(
            !PlayProductPolicy.validSessionToken(
                "Bearer " + "a".repeat(64)
            ),
            "Malformed authorization rejected"
        );

        if (passed != 12)
            throw new AssertionError("Test count mismatch");

        System.out.println(
            "=== WELCOME CHECKOUT POLICY: 12/12 PASS ==="
        );
    }
}
