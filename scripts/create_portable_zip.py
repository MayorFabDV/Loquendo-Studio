import os
import zipfile
import sys

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_dir = os.path.join(base_dir, "dist", "win-unpacked")
out_zip = os.path.join(base_dir, "dist", "LoquendoStudio-v1.2.0-win64-portable.zip")

if os.path.exists(out_zip):
    os.remove(out_zip)

print(f"Comprimiendo {src_dir} -> {out_zip}...")
count = 0
with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
    for root, dirs, files in os.walk(src_dir):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, src_dir)
            arcname = os.path.join("LoquendoStudio-v1.2.0-portable", rel_path)
            zf.write(full_path, arcname)
            count += 1
            if count % 200 == 0:
                print(f"  {count} archivos comprimidos...")

size_mb = os.path.getsize(out_zip) / (1024 * 1024)
print(f"ZIP creado exitosamente: {size_mb:.2f} MB ({count} archivos)")
