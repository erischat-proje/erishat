"""Host Java test: uses javac, or ERIS_ECJ_JAR with ERIS_JAVA when only a JRE is available."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[1]

def main():
    java=os.environ.get('ERIS_JAVA') or shutil.which('java')
    javac=shutil.which('javac')
    ecj=os.environ.get('ERIS_ECJ_JAR')
    if not java or not (javac or ecj):raise SystemExit('JDK (java + javac) gerekli; alternatif ERIS_JAVA ve ERIS_ECJ_JAR tanımlayın.')
    with tempfile.TemporaryDirectory(prefix='lidya-native-doc-') as temporary:
        root=Path(temporary);adapter=root/'android/util/Base64.java';adapter.parent.mkdir(parents=True);classes=root/'classes';classes.mkdir()
        adapter.write_text('package android.util; public final class Base64 { public static final int NO_WRAP=2; public static byte[] decode(String v,int f){return java.util.Base64.getDecoder().decode(v);} }')
        compiler=[javac,'--release','8'] if javac else [java,'-jar',ecj,'-1.8','-proc:none']
        subprocess.run(compiler+['-d',str(classes),str(adapter),str(ROOT/'android-native/app/src/main/java/com/erischat/app/MessageFileDownloads.java'),str(ROOT/'tests/MessageFileDownloadsTest.java')],check=True)
        subprocess.run([java,'-cp',str(classes),'com.erischat.app.MessageFileDownloadsTest'],check=True)
if __name__=='__main__':main()
