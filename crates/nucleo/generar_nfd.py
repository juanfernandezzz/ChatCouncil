# Genera src/nfd.rs: la descomposición canónica completa de cada punto de código y su clase de
# combinación, desde unicodedata de Python. Uso: python -I -X utf8 generar_nfd.py > src/nfd.rs
# y luego cargo fmt (el archivo versionado es la salida formateada).
import sys
import unicodedata as u

sys.stdout.reconfigure(newline="\n")  # LF también en Windows

saltar = lambda c: 0xD800 <= c < 0xE000 or 0xAC00 <= c <= 0xD7A3  # surrogates y Hangul (algorítmico)
desc, puntos = [], []
for c in range(0x110000):
    if saltar(c):
        continue
    d = u.normalize("NFD", chr(c))
    if d != chr(c):
        desc.append((c, len(puntos), len(d)))
        puntos.extend(ord(x) for x in d)

clases = []  # rangos contiguos con la misma clase de combinación distinta de 0
for c in range(0x110000):
    if 0xD800 <= c < 0xE000:
        continue
    k = u.combining(chr(c))
    if k:
        if clases and clases[-1][1] == c - 1 and clases[-1][2] == k:
            clases[-1][1] = c
        else:
            clases.append([c, c, k])

def filas(items, por_linea):
    for i in range(0, len(items), por_linea):
        print("    " + " ".join(items[i : i + por_linea]))

print(f"//! Generado por generar_nfd.py con unicodedata {u.unidata_version}: no editar a mano.")
print("//! String.prototype.normalize(\"NFD\") de Js.NormalizeNfd sin dependencias (ADR-0008).")
print()
print("/// (punto, inicio en PUNTOS, largo): la descomposición canónica completa.")
print(f"pub(crate) static DESCOMPOSICION: [(u32, u16, u8); {len(desc)}] = [")
filas([f"(0x{c:X}, {i}, {n})," for c, i, n in desc], 6)
print("];")
print()
print(f"pub(crate) static PUNTOS: [u32; {len(puntos)}] = [")
filas([f"0x{p:X}," for p in puntos], 12)
print("];")
print()
print("/// (desde, hasta, clase): la clase de combinación canónica; fuera de los rangos es 0.")
print(f"pub(crate) static CLASES: [(u32, u32, u8); {len(clases)}] = [")
filas([f"(0x{a:X}, 0x{b:X}, {k})," for a, b, k in clases], 5)
print("];")
