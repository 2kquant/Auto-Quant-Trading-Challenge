"""
모델 검사 및 복사 유틸리티
사용법(예):
    python check_and_copy_model.py --dest "C:\Users\kang\Desktop\GAE\2kquant\realtime_upbit_trend_model.pkl"

기본 동작: 사전 정의된 출발 위치들에서 모델 파일을 찾아 목적지로 복사합니다.
"""
import argparse
import shutil
from pathlib import Path

CANDIDATE_PATHS = [
    Path(r"c:\Quant\models\realtime_upbit_trend_model.pkl"),
    Path(r"c:\Quant\realtime_upbit_trend_model.pkl"),
    Path("realtime_upbit_trend_model.pkl"),
]


def find_model():
    for p in CANDIDATE_PATHS:
        if p.exists():
            return p.resolve()
    return None


def main():
    parser = argparse.ArgumentParser(description="Find and copy realtime_upbit_trend_model.pkl")
    parser.add_argument("--dest", required=False, help="Destination path to copy model to")
    args = parser.parse_args()

    src = find_model()
    if not src:
        print("모델 파일을 찾을 수 없습니다. 가능한 위치 확인하세요:")
        for p in CANDIDATE_PATHS:
            print(f"  - {p}")
        return

    print(f"발견된 모델: {src}")

    if args.dest:
        dest = Path(args.dest)
    else:
        dest = Path.cwd() / src.name

    dest.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copy2(src, dest)
        print(f"복사 완료: {dest}")
    except Exception as e:
        print(f"복사 실패: {e}")

if __name__ == '__main__':
    main()
