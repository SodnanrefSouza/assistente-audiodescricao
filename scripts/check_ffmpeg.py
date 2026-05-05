from app.core.ffmpeg_utils import ffmpeg_path, ffprobe_path

try:
    print("FFmpeg:", ffmpeg_path())
    print("FFprobe:", ffprobe_path())
    print("OK: FFmpeg e FFprobe encontrados.")
except Exception as exc:
    print("ERRO:", exc)
