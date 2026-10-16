from pathlib import Path
import subprocess
import tempfile
import shutil
root=Path(tempfile.mkdtemp(prefix='eris-native-check-'));src=root/'src'
stubs={
'android/content/Context.java':'''package android.content; public class Context { public Context getApplicationContext(){return this;} public android.content.res.AssetManager getAssets(){return null;} public java.io.File getFilesDir(){return null;} }''',
'android/content/res/AssetManager.java':'''package android.content.res; public class AssetManager { public java.io.InputStream open(String name) throws java.io.IOException {return null;} }''',
'android/net/Uri.java':'''package android.net; public class Uri { private java.net.URI value; public static Uri parse(String s){Uri u=new Uri();u.value=java.net.URI.create(s);return u;} public String getScheme(){return value.getScheme();}public String getHost(){return value.getHost();}public int getPort(){return value.getPort();}public String getUserInfo(){return value.getUserInfo();}public String getPath(){return value.getPath();} }''',
'android/os/SystemClock.java':'''package android.os; public class SystemClock { public static long elapsedRealtime(){return 1;} }''',
'android/webkit/WebResourceRequest.java':'''package android.webkit; public interface WebResourceRequest { boolean isForMainFrame(); String getMethod(); android.net.Uri getUrl(); }''',
'android/webkit/WebResourceResponse.java':'''package android.webkit; public class WebResourceResponse { public WebResourceResponse(String mime,String encoding,int status,String reason,java.util.Map<String,String> headers,java.io.InputStream stream){} }''',
'org/json/JSONObject.java':'''package org.json; public class JSONObject {public JSONObject(){}public JSONObject(String s){}public int getInt(String s)throws Exception{return 1;}public JSONObject getJSONObject(String s)throws Exception{return null;}public JSONObject optJSONObject(String s){return null;}public String optString(String s){return "";}public String getString(String s)throws Exception{return "";} }''',
'com/erischat/app/PolicyCheck.java':'''package com.erischat.app; import android.net.Uri; public class PolicyCheck {public static void main(String[] args){String host="eris.test";String[] bad={"http://eris.test/a.png","https://evil.test/a.png","https://eris.test.evil.test/a.png","https://user@eris.test/a.png","https://eris.test:444/a.png","https://eris.test/%2e%2e/a.png","https://eris.test/a/%2e/b.png","https://eris.test/a%5cb.png","https://eris.test/a%00.png"};for(String u:bad)if(BundledContent.mediaPath(Uri.parse(u),host)!=null)throw new AssertionError(u);String good=BundledContent.mediaPath(Uri.parse("https://eris.test:443/avatarveduvarka%C4%9F%C4%B1d%C4%B1/a.png?v=2"),host);if(!"avatarveduvarkağıdı/a.png".equals(good))throw new AssertionError(good);System.out.println("PASS: Java native class compiles against API-shaped stubs; trusted HTTPS origin, ports, userinfo, traversal, encoded separators/NUL, Turkish path and query policy.");}}'''
}
for name,body in stubs.items():p=src/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body)
java=shutil.which('java') or '/usr/lib/jvm/java-17-openjdk-amd64/bin/java'
files=[str(p)for p in src.rglob('*.java')]+[str(Path.cwd()/'android-native/app/src/main/java/com/erischat/app/BundledContent.java')]
subprocess.run([java,'-m','jdk.compiler/com.sun.tools.javac.Main','-d',str(root/'classes')]+files,check=True)
subprocess.run([java,'-cp',str(root/'classes'),'com.erischat.app.PolicyCheck'],check=True)

shutil.rmtree(root)
