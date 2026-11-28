package com.erischat.app;

public final class PaymentFlowGate {

    public static final class Ticket {
        public final String productId;

        private Ticket(String productId) {
            this.productId = productId;
        }
    }

    private Ticket active;
    private boolean launched;

    public synchronized Ticket acquire(String productId) {

        if (active != null ||
            !PlayProductPolicy.isKnown(productId))
            return null;

        active = new Ticket(productId);
        launched = false;

        return active;
    }

    public synchronized boolean isPreparing(Ticket ticket) {
        return ticket != null &&
            active == ticket && !launched;
    }

    public synchronized boolean markLaunched(Ticket ticket) {

        if (!isPreparing(ticket))
            return false;

        launched = true;

        return true;
    }

    public synchronized boolean abortPreparing(Ticket ticket) {

        if (!isPreparing(ticket))
            return false;

        active = null;
        launched = false;

        return true;
    }

    public synchronized boolean launchRejected(Ticket ticket) {

        if (ticket == null ||
            active != ticket || !launched)
            return false;

        active = null;
        launched = false;

        return true;
    }

    public synchronized boolean finishCallback(
        String productId,
        boolean terminalWithoutProduct
    ) {

        if (active == null || !launched)
            return false;

        if (productId == null) {
            if (!terminalWithoutProduct)
                return false;

        } else if (!active.productId.equals(productId)) {
            return false;
        }

        active = null;
        launched = false;

        return true;
    }

    public synchronized boolean isBusy() {
        return active != null;
    }
}
