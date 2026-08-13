# 🚀 Migrador Drive → Bunny Stream (Windows)

Script para migrar filmes do Google Drive para o Bunny Stream automaticamente no Windows.

**O que faz:**
- 📁 Lista filmes do Drive (só acima de 1 hora, até 5GB)
- ⬇️ Baixa temporariamente para pasta temp
- 🐰 Faz upload pro Bunny Stream
- 🗑️ Apaga o arquivo temporário automaticamente
- 📝 Gera relatório com nome + links de todos os filmes

---

## 📦 Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `migrar.js` | Script principal (Node.js) |
| `RODAR.bat` | Duplo clique para rodar tudo |
| `service-account-key.json` | Você cria (ver abaixo) |

---

## ⚡ Rápido (3 passos)

### 1. Instalar Node.js
Baixe e instale: **https://nodejs.org** (versão LTS, clique em "Next" até o fim)

### 2. Criar chave do Google Drive
1. Vá em https://console.cloud.google.com
2. Crie um projeto (ou use existente)
3. Ative a **Google Drive API**
4. Vá em **IAM & Admin → Service Accounts → CREATE**
5. Clique na conta criada → **Keys → Add Key → JSON**
6. Baixe o arquivo JSON e **cole na mesma pasta** dos scripts
7. **Renomeie** para: `service-account-key.json`
8. **Compartilhe a pasta do Drive** com o email da service account (ex: `nome@projeto.iam.gserviceaccount.com`)

### 3. Configurar o script
Abra `migrar.js` no Bloco de Notas e edite as 3 linhas no topo:

```javascript
DRIVE_FOLDER_ID: "COLE_AQUI_O_ID_DA_PASTA",
BUNNY_LIBRARY_ID: "COLE_AQUI",
BUNNY_API_KEY: "COLE_AQUI",
```

**Como pegar o ID da pasta do Drive:**
- Abra a pasta no navegador
- URL: `https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ`
- O ID é: `1aBcDeFgHiJkLmNoPqRsTuVwXyZ`

**Como pegar os dados do Bunny Stream:**
- Acesse https://bunny.net → Stream
- Crie um Library (ou use existente)
- Vá na aba **API** do library
- Copie **Library ID** e **API Key**

### 4. Rodar!
Dê **duplo clique** em `RODAR.bat`

Deixe a janela aberta! Vai levar horas dependendo da quantidade de filmes.

---

## 📄 Relatório

No final, serão criados:
- `relatorio-migracao.txt` — Lista legível com nome + links
- `relatorio-migracao.json` — Dados em formato JSON

Exemplo do TXT:
```
[001] Nome do Filme.mp4
    Tamanho: 1.85 GB | Duração: ~120min
    Video ID: abc123-def456
    Embed:    https://iframe.mediadelivery.net/embed/123/abc123
    HLS:      https://iframe.mediadelivery.net/play/123/abc123
```

---

## ⏱️ Tempo estimado

| Tamanho médio | Tempo por filme | 139 filmes |
|---------------|-----------------|------------|
| 1.5 GB        | ~8-12 min       | ~18-28h    |
| 2.5 GB        | ~15-20 min      | ~35-46h    |

> 💡 Deixe rodando durante a noite. O PC não pode desligar ou dormir!

---

## 🛠️ Configurações opcionais

No topo do `migrar.js`, você pode ajustar:

```javascript
MAX_FILE_SIZE_GB: 4.9,   // Bunny free limit (não mude)
MIN_DURATION_MIN: 60,    // Mínimo 1 hora (mude se quiser)
DELAY_MS: 3000,          // Delay entre uploads (aumente se der erro)
```

---

## 🆘 Problemas comuns

### "Node.js NAO encontrado!"
Instale o Node.js: https://nodejs.org (versão LTS)

### "service-account-key.json NAO ENCONTRADO!"
Você esqueceu de colocar o arquivo JSON do Google Cloud na mesma pasta.

### "Erro ao instalar dependencias"
Verifique sua conexão com a internet. Rode manualmente:
```cmd
npm install axios form-data googleapis
```

### Filme muito grande (acima de 5GB)
O Bunny Stream free limita a 5GB. Filmes maiores serão pulados automaticamente.
Para filmes maiores, você precisa do plano pago do Bunny ou dividir o arquivo.

### "Acesso negado" no Drive
Esqueceu de compartilhar a pasta do Drive com o email da service account.

---

## 💰 Custo Bunny Stream

- **Free**: Até 5GB por vídeo, 5.000 views/mês
- **Pago**: ~$0.01/GB storage + $0.005/GB banda
- 139 filmes (~200GB): ~$2/mês de storage
