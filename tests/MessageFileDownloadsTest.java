package com.erischat.app;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;

/** Host JVM behavior test; supply an android.util.Base64 adapter on the classpath. */
public final class MessageFileDownloadsTest {
    private static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) throws Exception {
        File cache = Files.createTempDirectory("message-download-test").toFile();
        MessageFileDownloads downloads = new MessageFileDownloads(cache);
        String[] types = MessageFileDownloads.acceptedTypes(new String[]{".pdf,.docx", "video/mp4,video/webm", "application/pdf"});
        check(types.length == 4 && types[0].equals("application/pdf") && types[1].contains("wordprocessingml")
                && types[2].equals("video/mp4") && types[3].equals("video/webm"), "Normalize extension, comma MIME filters and duplicates");
        check(MessageFileDownloads.acceptedTypes(new String[]{""})[0].equals("*/*"),"Empty chooser accepts all");
        check(downloads.begin("a.exe",1).isEmpty(),"Reject executable suffix");
        check(downloads.begin("a.pdf",0).isEmpty(),"Reject empty");
        check(downloads.begin("a.pdf",MessageFileDownloads.MAX_BYTES+1).isEmpty(),"Enforce 20 MB limit");
        byte[] chunk = new byte[65536]; for (int i=0;i<chunk.length;i++) chunk[i]=(byte)(i%251);
        String token = downloads.begin("../../rapor\r\n.pdf",2L*chunk.length+17);
        check(!token.isEmpty(),"Begin valid transfer");
        check(downloads.begin("b.pdf",1).isEmpty(),"One transfer at a time");
        check(!downloads.append("wrong", "eA=="),"Reject wrong token");
        downloads.cancel("wrong");check(downloads.isCurrent(token),"Wrong cancel cannot affect current transfer");
        String encoded = java.util.Base64.getEncoder().encodeToString(chunk);
        check(downloads.append(token,encoded)&&downloads.append(token,encoded),"Accept bounded chunks");
        check(downloads.append(token,java.util.Base64.getEncoder().encodeToString(Arrays.copyOf(chunk,17))),"Accept final chunk");
        MessageFileDownloads.Pending pending=downloads.prepare(token);
        check(pending!=null&&pending.name.equals("rapor.pdf"),"Sanitize paths/control characters");
        check(pending.mime.equals("application/pdf"),"MIME for create-document");
        byte[] actual=Files.readAllBytes(pending.file.toPath());check(actual.length==2*65536+17,"Exact size preserved");
        for(int i=0;i<actual.length;i++)check(actual[i]==chunk[i%65536],"Exact byte content preserved");
        check(!downloads.append(token,"eA=="),"No append after preparation");
        check(downloads.begin("b.pdf",1).isEmpty(),"SAF pending transfer remains exclusive");
        File savedTemp=pending.file;downloads.cancel(token);check(!savedTemp.exists(),"Delete temporary data after completion/cancel");
        token=downloads.begin("a.txt",2);check(downloads.append(token,"eA=="),"Partial chunk");check(downloads.prepare(token)==null,"Reject incomplete transfer");
        token=downloads.begin("a.csv",1);check(!downloads.append(token,"eHg="),"Reject decoded overflow");check(!downloads.isCurrent(token),"Overflow cancels data");
        token=downloads.begin("a.zip",1);check(!downloads.append(token,"!invalid!"),"Reject invalid base64");
        token=downloads.begin("a.docx",1);check(downloads.append(token,"eA=="),"Office transfer allowed");pending=downloads.prepare(token);check(pending!=null&&pending.mime.contains("wordprocessingml"),"Office MIME");downloads.cancelAll();check(!pending.file.exists(),"Lifecycle cleanup");
        System.out.println("PASS: native chunk bytes, names, size cap, token isolation, concurrency, incomplete/overflow rejection, cleanup");
    }
}
