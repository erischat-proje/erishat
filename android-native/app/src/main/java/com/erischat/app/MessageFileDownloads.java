package com.erischat.app;

import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Locale;
import java.util.UUID;

/** One bounded, chunked document transfer. Never writes outside the app cache. */
final class MessageFileDownloads {
    static final long MAX_BYTES = 20L * 1024 * 1024;
    private final File directory;
    private String token;
    private File file;
    private FileOutputStream stream;
    private String name;
    private long expected, written;
    private boolean prepared;

    static final class Pending {
        final String token, name, mime;
        final File file;
        Pending(String token, String name, String mime, File file) {
            this.token = token; this.name = name; this.mime = mime; this.file = file;
        }
    }

    MessageFileDownloads(File cache) { directory = new File(cache, "message-downloads"); }

    synchronized String begin(String filename, long size) {
        if (token != null || size <= 0 || size > MAX_BYTES) return "";
        String clean = filename == null ? "" : filename.replace('\\', '/');
        clean = clean.substring(clean.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\\p{Cf}]", "").trim();
        if (clean.isEmpty() || clean.length() > 160 || mime(clean) == null) return "";
        try {
            if (!directory.isDirectory() && !directory.mkdirs()) return "";
            file = File.createTempFile("document-", ".tmp", directory);
            stream = new FileOutputStream(file);
            token = UUID.randomUUID().toString(); name = clean; expected = size; written = 0; prepared = false;
            return token;
        } catch (IOException e) { clear(); return ""; }
    }

    synchronized boolean append(String id, String encoded) {
        if (!isCurrent(id) || prepared || encoded == null || encoded.length() > 90000) return false;
        try {
            byte[] chunk = Base64.decode(encoded, Base64.NO_WRAP);
            if (chunk.length == 0 || chunk.length > 65536 || written + chunk.length > expected) { clear(); return false; }
            stream.write(chunk); written += chunk.length; return true;
        } catch (IllegalArgumentException | IOException e) { clear(); return false; }
    }

    synchronized Pending prepare(String id) {
        if (!isCurrent(id) || prepared) return null;
        if (written != expected) { clear(); return null; }
        try {
            stream.close(); stream = null; prepared = true;
            return new Pending(token, name, mime(name), file);
        } catch (IOException e) { clear(); return null; }
    }

    synchronized boolean isCurrent(String id) { return token != null && token.equals(id); }
    synchronized void cancel(String id) { if (isCurrent(id)) clear(); }
    synchronized void cancelAll() { clear(); }
    private void clear() {
        try { if (stream != null) stream.close(); } catch (IOException ignored) { }
        if (file != null) file.delete();
        token = null; file = null; stream = null; name = null; expected = written = 0; prepared = false;
    }
    static String[] acceptedTypes(String[] raw) {
        java.util.ArrayList<String> result = new java.util.ArrayList<>();
        if (raw != null) for (String entry : raw) {
            if (entry == null) continue;
            for (String token : entry.split(",")) {
                String type = token.trim().toLowerCase(Locale.ROOT);
                if (type.startsWith(".")) {
                    String document = mime("file" + type);
                    if (document != null) type = document;
                    else if (type.equals(".jpg") || type.equals(".jpeg")) type = "image/jpeg";
                    else if (type.equals(".png")) type = "image/png";
                    else if (type.equals(".webp")) type = "image/webp";
                    else if (type.equals(".gif")) type = "image/gif";
                    else if (type.equals(".mp4")) type = "video/mp4";
                    else if (type.equals(".webm")) type = "video/webm";
                }
                if (type.matches("[a-z0-9.+*_-]+/[a-z0-9.+*_-]+") && !result.contains(type)) result.add(type);
            }
        }
        return result.isEmpty() ? new String[]{"*/*"} : result.toArray(new String[0]);
    }

    private static String mime(String filename) {
        String n = filename.toLowerCase(Locale.ROOT);
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".txt")) return "text/plain";
        if (n.endsWith(".csv")) return "text/csv";
        if (n.endsWith(".zip")) return "application/zip";
        if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
        return null;
    }
}
