import com.erischat.app.WelcomeLaunchPolicy;

public class WelcomeLaunchPolicyTest {

    static int passed = 0;

    static void check(boolean result, String name) {

        if (!result)
            throw new AssertionError(name);

        passed++;

        System.out.println("PASS: " + name);
    }

    public static void main(String[] args) {

        String request = "a".repeat(32);
        String hash = "b".repeat(64);

        String uuid =
            "12345678-1234-1234-1234-123456789012";

        String product = "welcome_gold_v1";

        check(WelcomeLaunchPolicy.validRequest(request),
            "Valid request");

        check(!WelcomeLaunchPolicy.validRequest("short"),
            "Invalid request rejected");

        check(!WelcomeLaunchPolicy.validRequest(null),
            "Missing request rejected");

        check(WelcomeLaunchPolicy.validUuid(uuid),
            "Canonical UUID");

        check(!WelcomeLaunchPolicy.validUuid("1-1-1-1-1"),
            "Noncanonical UUID rejected");

        check(WelcomeLaunchPolicy.validBinding(
            product,request,product,"gold",
            request,hash,uuid,uuid
        ), "Valid launch binding");

        check(!WelcomeLaunchPolicy.validBinding(
            product,request,"lidya_001","gold",
            request,hash,uuid,uuid
        ), "Wrong product rejected");

        check(!WelcomeLaunchPolicy.validBinding(
            product,request,product,"silver",
            request,hash,uuid,uuid
        ), "Wrong tier rejected");

        check(!WelcomeLaunchPolicy.validBinding(
            product,request,product,"gold",
            "c".repeat(32),hash,uuid,uuid
        ), "Wrong request rejected");

        check(!WelcomeLaunchPolicy.validBinding(
            product,request,product,"gold",
            request,"invalid",uuid,uuid
        ), "Invalid account binding rejected");

        check(WelcomeLaunchPolicy.validWindow(
            1000,91000
        ), "Valid 90-second permit");

        check(!WelcomeLaunchPolicy.validWindow(
            1000,1000
        ), "Expired permit rejected");

        check(!WelcomeLaunchPolicy.validWindow(
            1000,91001
        ), "Oversized permit lifetime rejected");

        check(WelcomeLaunchPolicy.validServerPrice(
            "TRY",9999,99990000L
        ), "Bronze price");

        check(WelcomeLaunchPolicy.validServerPrice(
            "TRY",24999,249990000L
        ), "Silver price");

        check(WelcomeLaunchPolicy.validServerPrice(
            "TRY",49999,499990000L
        ), "Gold price");

        check(!WelcomeLaunchPolicy.validServerPrice(
            "TRY",49999,1L
        ), "Manipulated price rejected");

        check(WelcomeLaunchPolicy.matchesPlayPrice(
            "TRY",499990000L,"TRY",499990000L
        ), "Matching Google Play price");

        check(!WelcomeLaunchPolicy.matchesPlayPrice(
            "TRY",499990000L,"USD",499990000L
        ), "Wrong currency rejected");

        check(!WelcomeLaunchPolicy.matchesPlayPrice(
            "TRY",499990000L,"TRY",599990000L
        ), "Google Play price mismatch rejected");

        if (passed != 20)
            throw new AssertionError("Test count mismatch");

        System.out.println(
            "=== WELCOME LAUNCH POLICY: 20/20 PASS ==="
        );
    }
}
