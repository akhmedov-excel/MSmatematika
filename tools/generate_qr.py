from pathlib import Path
import qrcode

BASE_URL = 'https://msmatematika.uz'
OUT = Path(__file__).resolve().parents[1] / 'qr'
OUT.mkdir(exist_ok=True)
for i in range(1, 21):
    url = f'{BASE_URL.rstrip("/")}/test/variant/{i}'
    img = qrcode.make(url)
    img.save(OUT / f'variant-{i:02d}.png')
    print(i, url)
