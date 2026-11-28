package com.erischat.app;

import android.os.SystemClock;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.concurrent.atomic.AtomicBoolean;

final class WelcomeLaunchAuthorization {

    private static final String ENDPOINT =
        "https://erischat-api-production.up.railway.app"
        + "/v1/welcome-packages/launch-authorize";

    private WelcomeLaunchAuthorization() {}

    static final class Grant {

        final String productId;
        final String accountHash;
        final String currency;
        final long priceMicros;

        private final long expiresAt;
        private final long monotonicExpiry;

        private final AtomicBoolean used =
            new AtomicBoolean(false);

        private Grant(
            String productId,
            String accountHash,
            String currency,
            long priceMicros,
            long expiresAt,
            long monotonicExpiry
        ) {
            this.productId = productId;
            this.accountHash = accountHash;
            this.currency = currency;
            this.priceMicros = priceMicros;
            this.expiresAt = expiresAt;
            this.monotonicExpiry = monotonicExpiry;
        }

        boolean isFresh() {
            return !used.get()
                && System.currentTimeMillis() < expiresAt
                && SystemClock.elapsedRealtime()
                    < monotonicExpiry;
        }

        boolean claim() {
            return isFresh()
                && used.compareAndSet(false, true);
        }
    }

    static Grant authorize(
        String productId,
        String accessToken,
        String requestId
    ) {

        String tier =
            PlayProductPolicy.welcomeTier(productId);

        if (tier == null
            || !PlayProductPolicy.validSessionToken(accessToken)
            || !WelcomeLaunchPolicy.validRequest(requestId))
            return null;

        long started =
            SystemClock.elapsedRealtime();

        HttpsURLConnection connection = null;

        try {

            connection = (HttpsURLConnection)
                new URL(ENDPOINT).openConnection();

            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setUseCaches(false);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);

            connection.setRequestProperty(
                "Authorization",
                "Bearer " + accessToken
            );

            connection.setRequestProperty(
                "Content-Type",
                "application/json"
            );

            byte[] payload = new JSONObject()
                .put("tier", tier)
                .put("request_id", requestId)
                .toString()
                .getBytes(StandardCharsets.UTF_8);

            connection.setFixedLengthStreamingMode(
                payload.length
            );

            try (OutputStream out =
                     connection.getOutputStream()) {
                out.write(payload);
            }

            if (connection.getResponseCode() != 200)
                return null;

            ByteArrayOutputStream response =
                new ByteArrayOutputStream();

            byte[] buffer = new byte[4096];

            try (InputStream in =
                     connection.getInputStream()) {

                int count;

                while ((count = in.read(buffer)) != -1) {

                    if (response.size() + count > 16384)
                        return null;

                    response.write(buffer, 0, count);
                }
            }

            JSONObject data = new JSONObject(
                response.toString("UTF-8")
            );

            if (!Boolean.TRUE.equals(
                    data.get("launch_allowed"))
                || !Boolean.FALSE.equals(
                    data.get("credited")))
                return null;

            String accountHash =
                data.getString("account_hash");

            if (!WelcomeLaunchPolicy.validBinding(
                productId,
                requestId,
                data.getString("product_id"),
                data.getString("tier"),
                data.getString("request_id"),
                accountHash,
                data.getString("permit_id"),
                data.getString("intent_id")
            )) return null;

            Object rawPrice =
                data.get("catalog_price_kurus");

            Object rawMicros =
                data.get("price_micros");

            if (!(rawPrice instanceof Integer)
                || !(rawMicros instanceof Integer
                    || rawMicros instanceof Long))
                return null;

            int priceKurus = (Integer) rawPrice;

            long priceMicros =
                ((Number) rawMicros).longValue();

            String currency =
                data.getString("currency");

            if (!WelcomeLaunchPolicy.validServerPrice(
                currency, priceKurus, priceMicros
            )) return null;

            long expiresAt = OffsetDateTime.parse(
                data.getString("expires_at")
            ).toInstant().toEpochMilli();

            long now = System.currentTimeMillis();

            if (!WelcomeLaunchPolicy.validWindow(
                now, expiresAt
            )) return null;

            long monotonicExpiry = Math.min(
                started + 90000L,
                SystemClock.elapsedRealtime()
                    + expiresAt - now
            );

            if (monotonicExpiry <=
                SystemClock.elapsedRealtime())
                return null;

            return new Grant(
                productId,
                accountHash,
                currency,
                priceMicros,
                expiresAt,
                monotonicExpiry
            );

        } catch (Exception ignored) {

            // Never log session or payment authorization.
            return null;

        } finally {

            if (connection != null)
                connection.disconnect();
        }
    }
}
