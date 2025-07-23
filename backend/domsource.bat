@echo off
setlocal EnableDelayedExpansion
REM ① MODO DEBUG—quita el REM en la línea siguiente para ver los comandos.
REM @echo on

REM ② Mantenemos la lista de extensiones
set "ALLOWED=html css bat js md cs sln csproj py json jsx ini"

REM ③ Archivo de salida: usa una ruta absoluta para descartar problemas de permisos
REM    Se crea un timestamp con el formato YYYYMMDDhhmmss
for /f "tokens=2 delims==" %%I in ('wmic os get LocalDateTime /value') do set "dt=%%I"
set "timestamp=%dt:~0,8%%dt:~8,6%"
set "OUT=%cd%\dump_%timestamp%.txt"

REM ④ Limpia / crea el fichero de salida de forma más portable
type nul > "%OUT%" || (
    echo [ERROR] No se pudo crear "%OUT%".
    pause
    goto :eof
)

REM ⑤ Contador opcional para saber si encontró algo
set /a count=0

echo Buscando archivos permitidos y volcando contenido...
echo (Omitiendo carpetas 'node_modules')
echo.

for /R %%F in (*) do (
    set "filePath=%%~fF"

    REM Convertir filePath a minúsculas para la comparación (opcional, pero más robusto si el nombre de la carpeta puede variar en mayúsculas/minúsculas)
    REM Sin embargo, findstr con /I ya hace la comparación sin distinguir mayúsculas/minúsculas
    REM set "lowerFilePath=!filePath:\=/!" REM Reemplazar \ con / para normalizar, luego convertir a minúsculas si es necesario, pero findstr es mejor

    REM Comprobar si la ruta contiene "\node_modules\" (insensible a mayúsculas/minúsculas)
    echo "!filePath!" | findstr /I /C:"\node_modules\" >nul
    if errorlevel 1 (
        REM errorlevel 1 significa que NO se encontró "\node_modules\" en la ruta
        REM Proceder a verificar la extensión y volcar el archivo
        set "ext=%%~xF"
        if defined ext (
            set "ext=!ext:~1!"
            for %%E in (%ALLOWED%) do if /I "%%E"=="!ext!" (
                echo === %%~fF>>"%OUT%"
                type "%%F">>"%OUT%"
                echo.>>"%OUT%"
                echo --- >>"%OUT%"
                set /a count+=1
                REM Opcional: Mostrar qué archivo se está procesando
                echo Procesado: %%~fF
            )
        )
    ) else (
        REM Opcional: Mostrar qué archivo/carpeta se está omitiendo
        REM echo Omitiendo (en node_modules): !filePath!
    )
)

echo.
echo Dump completado. Archivos copiados: !count!
echo Salida: "%OUT%"
echo.

REM pause
endlocal