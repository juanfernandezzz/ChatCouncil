#!/bin/bash
# Línea base del repo: install, typecheck, ocho guards, motor, build, referencias. Uso: medir.sh ETIQUETA
cd "/c/Users/Juan Fernández/Documents/Proyectos/ChatCouncil-main"
DOTNET=/c/Users/JUANFE~1/AppData/Local/Microsoft/dotnet/dotnet.exe
paso(){ local n="$1"; shift; local out; out=$("$@" 2>&1); local c=$?; echo "== $n: salida $c"; echo "$out" | tail -3; }
paso "pnpm install --frozen-lockfile" pnpm install --frozen-lockfile
paso typecheck pnpm typecheck
for g in sellado specs sondeo dominio trazabilidad surrogates contraste; do paso "guard:$g" pnpm -s guard:$g; done
paso "dotnet test" $DOTNET test "motor/Dotnet~/Pruebas/Pruebas.csproj"
paso "pnpm build" pnpm build
paso "guard:artefacto" pnpm -s guard:artefacto
paso "referencias.mjs" node "motor/Dotnet~/referencias.mjs"
echo "== git status tras regenerar referencias:"; git status --short
