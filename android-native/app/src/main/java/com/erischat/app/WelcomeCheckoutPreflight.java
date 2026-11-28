package com.erischat.app;

import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.time.Instant;
import java.util.UUID;

public final class WelcomeCheckoutPreflight {

    private static final String ENDPOINT =
        "https://erischat-api-production.up.railway.app"
        + "/v1/welcome-packages/prepare";

    private WelcomeCheckoutPreflight() {}

    public static String verify(
        String productId,
        String accessToken
    ) {

        String tier =
            PlayProductPolicy.welcomeTier(productId);

        if (tier == null ||
            !PlayProductPolicy.validSessionToken(accessToken))
            return "invalid_request";

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
                .toString()
                .getBytes(StandardCharsets.UTF_8);

            connection.setFixedLengthStreamingMode(
                payload.length
            );

            try (OutputStream out =
                     connection.getOutputStream()) {
                out.write(payload);
            }

            int status = connection.getResponseCode();

            if (status == 401 || status == 403)
                return "access_denied";

            if (status == 409)
                return "package_conflict";

            if (status == 503)
                return "checkout_disabled";

            if (status != 200)
                return "verification_failed";

            byte[] buffer = new byte[4096];

            ByteArrayOutputStream response =
                new ByteArrayOutputStream();

            try (InputStream in =
                     connection.getInputStream()) {

                int read;

                while ((read = in.read(buffer)) != -1) {

                    if (response.size() + read > 32768)
                        return "invalid_response";

                    response.write(buffer, 0, read);
                }
            }

            JSONObject data = new JSONObject(
                response.toString("UTF-8")
            );

            if (!productId.equals(
                    data.getString("product_id"))
                || !tier.equals(
                    data.getString("tier"))
                || !"prepared".equals(
                    data.getString("status"))
                || !PlayProductPolicy.validAccountHash(
                    data.getString("account_hash"))
                || !Boolean.FALSE.equals(
                    data.get("credited"))) {

                return "invalid_response";
            }

            UUID.fromString(
                data.getString("intent_id")
            );

            Instant expiry = OffsetDateTime.parse(
                data.getString("offer_expires_at")
            ).toInstant();

            if (!expiry.isAfter(Instant.now()))
                return "offer_expired";

            if (!Boolean.FALSE.equals(
                    data.get("launch_allowed"))) {

                // V10.7 never permits payment launch.
                return "launch_not_supported";
            }

            return "prepared_locked";

        } catch (Exception ignored) {

            // Never log authorization or response content.
            return "verification_failed";

        } finally {

            if (connection != null)
                connection.disconnect();
        }
    }
}
