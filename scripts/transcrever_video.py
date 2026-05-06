from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.transcription import transcribe_video


def main() -> int:
    parser = argparse.ArgumentParser(description="Extrai audio de um video e gera transcricao TXT/SRT.")
    parser.add_argument("video", help="Caminho do video")
    parser.add_argument("--model", default=None, help="Modelo faster-whisper. Padrao do app: small")
    parser.add_argument("--device", default=None, choices=["cpu", "cuda"], help="cpu ou cuda")
    parser.add_argument("--compute-type", default=None, help="int8 no CPU, float16 no CUDA")
    parser.add_argument("--language", default=None, help="Idioma do audio, ex.: pt, en, es")
    parser.add_argument("--keep-audio", action="store_true", help="Mantem o WAV extraido")
    args = parser.parse_args()

    video_path = Path(args.video).expanduser().resolve()
    if not video_path.exists():
        print("Arquivo de video nao encontrado.", file=sys.stderr)
        return 1

    output_dir = video_path.parent / f"{video_path.stem}_transcricao"

    def progress(percent: float, message: str) -> None:
        print(f"{percent:5.1f}% - {message}", flush=True)

    result = transcribe_video(
        video_path,
        output_dir,
        model_name=args.model,
        device=args.device,
        compute_type=args.compute_type,
        language=args.language,
        keep_audio=args.keep_audio,
        progress_callback=progress,
    )
    print("\nConcluido.")
    print(f"SRT: {result.srt_path}")
    print(f"TXT: {result.txt_path}")
    print(f"Falas reconhecidas: {len(result.segments)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
