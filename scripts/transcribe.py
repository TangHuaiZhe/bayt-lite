import json
import os
import sys

import mlx_whisper


audio_path, output_path = sys.argv[1:3]
result = mlx_whisper.transcribe(
    audio_path,
    path_or_hf_repo=os.environ.get("WHISPER_MODEL", "mlx-community/whisper-small-mlx"),
    language="en",
    task="transcribe",
    word_timestamps=True,
    verbose=False,
)
with open(output_path, "w", encoding="utf-8") as output_file:
    json.dump({"segments": result.get("segments", [])}, output_file, ensure_ascii=False)
