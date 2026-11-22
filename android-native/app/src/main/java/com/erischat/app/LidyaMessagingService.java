package com.erischat.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public class LidyaMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "lidyachat_messages";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        // FCM may rotate the token while the app is backgrounded.
        // Store it privately; authenticated registration is performed
        // only by the trusted WebView after the user returns.
        if (token != null && !token.isEmpty()) {
            getSharedPreferences("lidya_push", MODE_PRIVATE)
                .edit()
                .putString("latest_fcm_token", token)
                .apply();
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        super.onMessageReceived(message);

        // Notification payload'lari arka planda FCM gosterebilir.
        // Cift bildirim olusturmamak icin burada data-only
        // bildirimleri ele aliyoruz.
        if (message.getNotification() != null) return;

        String kind = message.getData().get("kind");
        if (!"dm_message".equals(kind)) return;

        String recipientId = message.getData().get("recipient_id");
        String activeUser = getSharedPreferences(
            "lidya_push", MODE_PRIVATE
        ).getString("active_push_user", "");

        // Never display pushes belonging to another account.
        // Also fail closed when no account is active.
        if (recipientId == null || recipientId.isEmpty()
                || activeUser.isEmpty()
                || !recipientId.equals(activeUser)) return;

        showNotification();
    }

    private void showNotification() {
        NotificationManager manager =
            (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        if (manager == null) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "LidyaChat Bildirimleri",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        manager.createNotificationChannel(channel);

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP |
                        Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pending = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT |
            PendingIntent.FLAG_IMMUTABLE
        );

        // Mesaj icerigi gizlilik kurallari tamamlanana
        // kadar kilit ekraninda gosterilmez.
        Notification notification =
            new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("LidyaChat")
                .setContentText("Yeni bir bildirimin var")
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build();

        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(
                android.Manifest.permission.POST_NOTIFICATIONS
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }

        manager.notify(
            (int)(System.currentTimeMillis() & 0x7fffffff),
            notification
        );
    }
}
