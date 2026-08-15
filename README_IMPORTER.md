# 🎬 MovieFlix - Importador Automático YouTube → Bunny Stream

Script que automatiza todo o processo de importação de filmes do canal do YouTube para o seu site MovieFlix.

## ⚡ O que faz

1. **Lista** todos os vídeos do canal `@noitedefilmesbrasil`
2. **Busca** cada título no TMDB (capa, descrição, ano, gênero)
3. **Filtra** apenas filmes acima de 2020
4. **Baixa** o vídeo do YouTube em alta qualidade
5. **Faz upload** para o Bunny Stream (player limpo, sem logo do YouTube)
6. **Insere** direto na tabela `movies` do Supabase
7. **Apaga** o arquivo local do PC

## 🚀 Como usar

### 1. Instale as dependências

```bash
pip install -r requirements.txt
```

Ou instale manualmente:
```bash
pip install requests yt-dlp
```

### 2. Configure as variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Edite o `.env` com suas chaves:

| Variável | Onde pegar |
|----------|-----------|
| `TMDB_API_KEY` | https://www.themoviedb.org/settings/api |
| `BUNNY_API_KEY` | Bunny.net → Stream → API → Access Key |
| `BUNNY_LIBRARY_ID` | Bunny.net → Stream → sua biblioteca → ID |
| `SUPABASE_URL` | Painel Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Painel Supabase → Settings → API → Service Role Key |

> ⚠️ **IMPORTANTE**: Use a **Service Role Key**, não a anon key!

### 3. Execute o script

```bash
python auto_import.py
```

O script vai:
- Listar todos os vídeos do canal
- Buscar no TMDB
- Filtrar filmes >2020
- Baixar do YouTube
- Fazer upload pro Bunny
- Inserir no Supabase
- Apagar os arquivos locais

### 4. Verifique no seu site

Acesse `https://movieflix-bszf.onrender.com` e confira se os filmes apareceram!

## 📁 Estrutura da tabela `movies`

O script insere direto na tabela `movies` com esses campos:

| Campo | Valor |
|-------|-------|
| `tmdb_id` | ID do TMDB |
| `title` | Título do filme |
| `description` | Sinopse do TMDB |
| `poster_url` | Capa do TMDB (w500) |
| `backdrop_url` | Banner do TMDB (original) |
| `video_url` | Player do Bunny Stream (sem logo YT) |
| `language` | pt-BR |
| `quality` | HD |
| `type` | filme |
| `required_plan` | standard |
| `category` | Gêneros do filme |
| `duration` | Duração em minutos |
| `year` | Ano de lançamento |

## 🔒 Sobre o player Bunny Stream

O Bunny Stream gera um player próprio:
```
https://iframe.mediadelivery.net/embed/{LIBRARY_ID}/{VIDEO_ID}
```

Esse player:
- ✅ **Não tem logo do YouTube**
- ✅ **Não tem link para o YouTube**
- ✅ **Não tem sugestões de vídeos**
- ✅ **É clean e profissional**
- ✅ **Parece um streaming original**

## 🛠️ Configurações opcionais

No topo do script `auto_import.py`, você pode ajustar:

```python
ANO_MINIMO = 2020        # Filtra filmes acima desse ano
APAGAR_LOCAL = True      # True = apaga arquivo após upload
PASTA_DOWNLOADS = "downloads"  # Pasta onde baixa temporariamente
```

## 🐛 Problemas comuns

### "yt-dlp não encontrado"
```bash
pip install yt-dlp
```

### "Erro 401 no Supabase"
Verifique se está usando a **Service Role Key**, não a anon key.

### "Erro no upload do Bunny"
Verifique se o `BUNNY_LIBRARY_ID` está correto e se a biblioteca existe.

### "Nenhum filme encontrado"
O canal tem muitos filmes antigos (TV Movies dos anos 90/2000). O script filtra apenas >2020. Ajuste `ANO_MINIMO` se quiser.

## 📄 Relatório

Após a execução, um arquivo `relatorio_importacao_YYYYMMDD_HHMMSS.json` é gerado com:
- Filmes importados com sucesso
- Erros encontrados
- IDs do Bunny e TMDB

## 📜 Licença

Uso interno do MovieFlix.
