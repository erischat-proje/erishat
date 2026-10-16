"""Validate social videos without transcoding or removing their audio."""
from io import BytesIO
import math

import av
from fastapi import HTTPException


def validate_social_video(data: bytes) -> None:
    try:
        with av.open(BytesIO(data)) as container:
            if not container.streams.video:
                raise ValueError('No video stream')
            duration = 0.0
            if container.duration is not None:
                duration = max(duration, container.duration / av.time_base)
            for stream in container.streams:
                if stream.type not in ('video', 'audio'):
                    continue
                if stream.duration is not None and stream.time_base is not None:
                    duration = max(duration, float(stream.duration * stream.time_base))
            # Check packet endpoints too, including the audio track.
            for packet in container.demux():
                stream = packet.stream
                if stream.type not in ('video', 'audio') or packet.pts is None or packet.time_base is None:
                    continue
                start = stream.start_time or 0
                duration = max(duration, float((packet.pts + (packet.duration or 0) - start) * packet.time_base))
                if duration > 30:
                    raise HTTPException(422, 'Video en fazla 30 saniye olabilir')
            if not math.isfinite(duration) or duration <= 0:
                raise ValueError('Unknown duration')
            if duration > 30:
                raise HTTPException(422, 'Video en fazla 30 saniye olabilir')
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(415, 'Video veya video süresi okunamadı. MP4 veya WEBM seçin') from exc
