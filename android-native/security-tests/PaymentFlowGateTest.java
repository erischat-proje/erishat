import com.erischat.app.PaymentFlowGate;

public class PaymentFlowGateTest {

    private static int passed = 0;

    private static void check(boolean result, String name) {

        if (!result)
            throw new AssertionError(name);

        passed++;
        System.out.println("PASS: " + name);
    }

    public static void main(String[] args) {

        PaymentFlowGate gate = new PaymentFlowGate();

        check(!gate.isBusy(), "Initially available");

        check(gate.acquire("fake_product") == null,
            "Unknown product rejected");

        PaymentFlowGate.Ticket standard =
            gate.acquire("lidya_001");

        check(standard != null,
            "Standard checkout acquired");

        check(gate.acquire("welcome_gold_v1") == null,
            "Welcome blocked during standard checkout");

        check(gate.acquire("lidya_002") == null,
            "Concurrent standard checkout blocked");

        check(!gate.finishCallback("lidya_001", false),
            "Callback cannot unlock preparation");

        check(gate.abortPreparing(standard),
            "Preparation cancellation");

        PaymentFlowGate.Ticket welcome =
            gate.acquire("welcome_gold_v1");

        check(welcome != null,
            "Welcome checkout acquired");

        check(gate.acquire("lidya_001") == null,
            "Standard blocked during welcome checkout");

        check(!gate.markLaunched(standard),
            "Old ticket cannot launch");

        check(gate.markLaunched(welcome),
            "Current ticket launches once");

        check(!gate.markLaunched(welcome),
            "Repeated launch blocked");

        check(!gate.abortPreparing(welcome),
            "Launched payment cannot timeout");

        check(!gate.finishCallback("lidya_001", false),
            "Unrelated product callback rejected");

        check(gate.finishCallback(
            "welcome_gold_v1", false
        ), "Matching callback releases lock");

        check(!gate.isBusy(),
            "Payment gate available again");

        if (passed != 16)
            throw new AssertionError("Test count mismatch");

        System.out.println(
            "=== PAYMENT FLOW GATE: 16/16 PASS ==="
        );
    }
}
