package com.erischat.app;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Public, build-time media only. Never intercept authentication, API or user uploads. */
final class BundledContent {
    private final Context context;
    private final String host;
    private final JSONObject bundled;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile JSONObject current;
    private long lastRefresh;
    private volatile boolean closed;

    BundledContent(Context context, String host) {
        this.context = context.getApplicationContext();
        this.host = host;
        JSONObject entries = new JSONObject();
        try (InputStream stream = context.getAssets().open("static-pack/index.json")) {
            entries = readIndex(stream);
        } catch (Exception ignored) { /* A missing pack must keep normal online behavior. */ }
        bundled = entries;
        File cache = new File(context.getFilesDir(), "public-content-index.json");
        try (InputStream stream = new FileInputStream(cache)) {
            current = readIndex(stream);
        } catch (Exception ignored) { }
        refresh();
    }

    static String mediaPath(Uri uri, String host) {
        if (uri == null || !"https".equals(uri.getScheme()) || !host.equals(uri.getHost())
                || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)) return null;
        String path = uri.getPath();
        if (path == null || !path.startsWith("/") || path.indexOf('\\') >= 0 || path.indexOf('\0') >= 0) return null;
        for (String part : path.split("/", -1)) if (part.equals(".") || part.equals("..")) return null;
        return path.substring(1);
    }

    WebResourceResponse intercept(WebResourceRequest request) {
        if (request.isForMainFrame() || !"GET".equals(request.getMethod())) return null;
        String path = mediaPath(request.getUrl(), host);
        if (path == null) return null;
        JSONObject entry = bundled.optJSONObject(path);
        if (entry == null) return null;
        JSONObject remote = current;
        // A newer deployed artwork must use the network until a matching APK is installed.
        if (remote != null && !entry.optString("sha256").equals(remote.optString(path))) return null;
        try {
            String asset = entry.getString("asset");
            if (!asset.matches("media/[a-f0-9]{64}\\.[a-z0-9]+")) return null;
            InputStream stream = context.getAssets().open("static-pack/"+asset);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            headers.put("X-ErisChat-Content", "installed");
            String mime = entry.getString("mime");
            return new WebResourceResponse(mime, mime.equals("image/svg+xml") ? "UTF-8" : null,
                    200, "OK", headers, stream);
        } catch (Exception ignored) { return null; }
    }

    synchronized void refresh() {
        long now = android.os.SystemClock.elapsedRealtime();
        if (closed || (lastRefresh != 0 && now-lastRefresh < 60_000)) return;
        lastRefresh = now;
        worker.execute(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("https://"+host+"/apk-content-manifest.json").openConnection();
                connection.setConnectTimeout(2500);
                connection.setReadTimeout(2500);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Cache-Control", "no-cache");
                if (connection.getResponseCode() != 200) return;
                byte[] data;
                try (InputStream stream = connection.getInputStream()) { data = read(stream); }
                JSONObject next = parseIndex(data);
                if (closed) return;
                current = next;
                File temp = new File(context.getFilesDir(), "public-content-index.tmp");
                try (java.io.FileOutputStream output = new java.io.FileOutputStream(temp)) { output.write(data); }
                temp.renameTo(new File(context.getFilesDir(), "public-content-index.json"));
            } catch (Exception ignored) { /* Offline launch still uses installed artwork. */ }
            finally { if (connection != null) connection.disconnect(); }
        });
    }

    private static byte[] read(InputStream stream) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = stream.read(buffer)) != -1) {
            if (output.size()+count > 2*1024*1024) throw new java.io.IOException("Index too large");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
    private static JSONObject parseIndex(byte[] data) throws Exception {
        JSONObject index = new JSONObject(new String(data, StandardCharsets.UTF_8));
        if (index.getInt("schema") != 1) throw new java.io.IOException("Unknown index");
        return index.getJSONObject("files");
    }
    private static JSONObject readIndex(InputStream stream) throws Exception { return parseIndex(read(stream)); }
    synchronized void close() { closed = true; worker.shutdownNow(); }
}
