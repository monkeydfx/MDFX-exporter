#!/usr/bin/env python3
"""
Convierte icon.ico a icon.icns para macOS
"""
from PIL import Image
import os

def create_icns_from_ico():
    ico_path = "src/assets/icons/icon.ico"
    icns_path = "src/assets/icons/icon.icns"
    
    try:
        # Abrir el .ico
        print(f"📖 Leyendo {ico_path}...")
        img = Image.open(ico_path)
        
        # Redimensionar a tamaño estándar macOS (512x512)
        print(f"📐 Redimensionando a 512x512...")
        img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
        
        # Guardar como ICNS
        print(f"💾 Guardando como {icns_path}...")
        img_512.save(icns_path, format='ICNS')
        
        if os.path.exists(icns_path):
            print(f"✅ Conversión exitosa!")
            print(f"📦 Archivo creado: {icns_path}")
            return True
        else:
            print(f"❌ Error: No se pudo crear el archivo ICNS")
            return False
            
    except Exception as e:
        print(f"❌ Error durante la conversión: {e}")
        print(f"\n💡 Alternativa: Descarga desde https://cloudconvert.com/ico-to-icns")
        return False

if __name__ == "__main__":
    create_icns_from_ico()
