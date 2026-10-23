"""Bounded attachment validation and safe download metadata."""
from io import BytesIO
import re
import unicodedata
from pathlib import PurePosixPath
from urllib.parse import quote
import zipfile
from fastapi import HTTPException
from .message_attachment_models import MessageAttachment

MIB=1024*1024
VIDEO_LIMIT=25*MIB
DOCUMENT_LIMIT=20*MIB
VIDEO_SECONDS=120
DOCUMENTS={'.pdf':'application/pdf','.txt':'text/plain','.csv':'text/csv','.zip':'application/zip',
           '.docx':'application/octet-stream','.xlsx':'application/octet-stream','.pptx':'application/octet-stream'}

def safe_name(value,default='dosya'):
    value=unicodedata.normalize('NFC',str(value or default)).replace('\\','/').rsplit('/',1)[-1]
    value=''.join(c for c in value if not unicodedata.category(c).startswith('C'))
    value=re.sub(r'\s+',' ',value).strip(' .')
    if not value:value=default
    if len(value)>150:
        suffix=PurePosixPath(value).suffix[:12]
        value=value[:150-len(suffix)]+suffix
    suffix=PurePosixPath(value).suffix[:12]
    stem=value[:-len(suffix)] if suffix else value
    while len((stem+suffix).encode("utf-8"))>180:stem=stem[:-1]
    return stem+suffix

def validate_document(data,filename):
    if not data or len(data)>DOCUMENT_LIMIT:raise HTTPException(413,'Belge en fazla 20 MB olabilir.')
    name=safe_name(filename)
    ext=PurePosixPath(name).suffix.lower()
    if ext not in DOCUMENTS:raise HTTPException(415,'PDF, TXT, CSV, ZIP, DOCX, XLSX veya PPTX seçin.')
    if ext=='.pdf':
        if not data.startswith(b'%PDF-') or b'%%EOF' not in data[-2048:]:raise HTTPException(415,'PDF dosyası okunamadı.')
    elif ext in ('.txt','.csv'):
        try:
            text=data.decode('utf-8-sig')
            if '\x00' in text:raise ValueError()
        except (UnicodeDecodeError,ValueError):raise HTTPException(415,'Metin/CSV belgesini UTF-8 biçiminde kaydedin.')
    else:
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                entries=archive.infolist()
                if len(entries)>5000 or sum(i.file_size for i in entries)>200*MIB or any(i.flag_bits&1 for i in entries):raise ValueError()
                if ext!='.zip':
                    names=set(archive.namelist());part={'.docx':'word/document.xml','.xlsx':'xl/workbook.xml','.pptx':'ppt/presentation.xml'}[ext]
                    if '[Content_Types].xml' not in names or part not in names or any(n.lower().endswith('vbaproject.bin') for n in names):raise ValueError()
        except (zipfile.BadZipFile,ValueError,NotImplementedError):raise HTTPException(415,'Arşiv/Office belgesi okunamadı veya desteklenmiyor.')
    return name,DOCUMENTS[ext]

def validate_video(data,mime,filename):
    mime=(mime or '').split(';',1)[0].lower().strip()
    if not data or len(data)>VIDEO_LIMIT:raise HTTPException(413,'Video en fazla 25 MB olabilir.')
    valid=(mime=='video/mp4' and len(data)>12 and data[4:8]==b'ftyp') or (mime=='video/webm' and data.startswith(b'\x1a\x45\xdf\xa3'))
    if not valid:raise HTTPException(415,'MP4 veya WEBM video seçin.')
    from .social_media import validate_social_video
    validate_social_video(data,maximum_seconds=VIDEO_SECONDS)
    name=safe_name(filename,'video.mp4' if mime=='video/mp4' else 'video.webm')
    expected='.mp4' if mime=='video/mp4' else '.webm'
    if PurePosixPath(name).suffix.lower()!=expected:name=PurePosixPath(name).stem+expected
    return name,mime

def content_headers(media,attachment):
    headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff'}
    if media.media_type=='document':
        name=attachment.filename if attachment else 'belge'
        headers['Content-Disposition']="attachment; filename=\"download\"; filename*=UTF-8''"+quote(safe_name(name),safe='')
        headers['Content-Security-Policy']="sandbox; default-src 'none'"
    return headers
