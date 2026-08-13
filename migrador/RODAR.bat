@echo off
chcp 65001 >nul
title Migrador Drive -> Bunny Stream
color 0A

echo.
echo  ╔══════════════════════════════════════════════════════════════╗
echo  ║  🚀 MIGRADOR: Google Drive -^> Bunny Stream                   ║
echo  ║  Filmes acima de 1 hora ^| Max 5GB por arquivo               ║
echo  ╚══════════════════════════════════════════════════════════════╝
echo.

:: Verificar se Node.js está instalado
node --version >nul 2>&1
if errorlevel 1 (
    echo  ❌ Node.js NAO encontrado!
    echo.
    echo  📥 Baixe e instale: https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    echo  ^(Escolha a versao LTS, instale com "Next Next Finish"^)
    echo.
    pause
    exit /b 1
)

echo  ✅ Node.js encontrado:
node --version
echo.

:: Verificar se dependências estão instaladas
if not exist "node_modules" (
    echo  📦 Instalando dependencias (axios, form-data, googleapis)...
    echo  ⏳ Isso pode levar 1-2 minutos na primeira vez...
    echo.
    call npm install axios form-data googleapis
    if errorlevel 1 (
        echo.
        echo  ❌ Erro ao instalar dependencias!
        echo  🌐 Verifique sua conexao com a internet.
        pause
        exit /b 1
    )
    echo.
    echo  ✅ Dependencias instaladas!
) else (
    echo  ✅ Dependencias ja instaladas.
)

echo.

:: Verificar se service-account-key.json existe
if not exist "service-account-key.json" (
    echo  ⚠️  ARQUIVO service-account-key.json NAO ENCONTRADO!
    echo.
    echo  📋 Como criar:
    echo     1. Va em https://console.cloud.google.com
    echo     2. Crie um projeto ^(ou use um existente^)
    echo     3. Ative a "Google Drive API"
    echo     4. IAM ^& Admin ^> Service Accounts ^> CRIAR
    echo     5. Clique na conta ^> Keys ^> Add Key ^> JSON
    echo     6. Baixe o arquivo e cole AQUI na mesma pasta
    echo     7. Renomeie para: service-account-key.json
    echo     8. Compartilhe a pasta do Drive com o email da service account
    echo.
    pause
    exit /b 1
)

echo  ✅ service-account-key.json encontrado.
echo.

:: Verificar se migrar.js existe
if not exist "migrar.js" (
    echo  ❌ Arquivo migrar.js nao encontrado!
    echo  📥 Certifique-se de que migrar.js esta na mesma pasta.
    pause
    exit /b 1
)

:: Perguntar se quer editar config antes
echo  📋 ANTES DE RODAR, edite o arquivo migrar.js
echo     e preencha: DRIVE_FOLDER_ID, BUNNY_LIBRARY_ID, BUNNY_API_KEY
echo.
set /p editar="Quer editar agora? (S/N): "
if /I "%editar%"=="S" (
    notepad migrar.js
    echo.
    echo  📝 Feche o bloco de notas quando terminar de editar...
    pause
)

echo.
echo  🎬 Iniciando migracao...
echo  ⏳ Deixe essa janela aberta! Pode levar horas.
echo  💾 Os arquivos sao baixados temporariamente e apagados automaticamente.
echo.
echo  ═══════════════════════════════════════════════════════════════
echo.

:: Rodar o script
node migrar.js

echo.
echo  ═══════════════════════════════════════════════════════════════
echo.
if exist "relatorio-migracao.txt" (
    echo  ✅ MIGRACAO CONCLUIDA!
    echo.
    echo  📄 Links salvos em:
    echo     - relatorio-migracao.txt  ^(legivel^)
    echo     - relatorio-migracao.json ^(dados^)
    echo.
    echo  🌐 Va no painel do Bunny Stream para ver seus videos:
    echo     https://bunny.net/dashboard/stream
) else (
    echo  ⚠️  A migracao terminou mas nao gerou relatorio.
    echo  📋 Verifique os erros acima.
)

echo.
pause
