#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🎬 MovieFlix - Importador Automático YouTube → Bunny Stream → Supabase

Fluxo completo:
1. Lista todos os vídeos do canal do YouTube (@noitedefilmesbrasil)
2. Busca cada título no TMDB
3. Filtra apenas filmes/séries acima de 2020
4. Baixa o vídeo do YouTube (yt-dlp)
5. Faz upload para o Bunny Stream (player limpo, sem logo)
6. Insere direto na tabela `movies` do Supabase
7. Apaga o arquivo local do PC

Autor: MovieFlix Auto-Importer
Data: 2025-08-15
"""

import os
import sys
import json
import subprocess
import requests
import time
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any

# ============================================================
# ⚙️ CONFIGURAÇÕES - PREENCHA AQUI OU USE VARIÁVEIS DE AMBIENTE
# ============================================================

YOUTUBE_CHANNEL = "@noitedefilmesbrasil"

# TMDB API Key → https://www.themoviedb.org/settings/api
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "SUA_TMDB_API_KEY_AQUI")

# Bunny Stream → https://bunny.net/stream/
BUNNY_API_KEY = os.getenv("BUNNY_API_KEY", "SUA_BUNNY_API_KEY_AQUI")
BUNNY_LIBRARY_ID = os.getenv("BUNNY_LIBRARY_ID", "SEU_BUNNY_LIBRARY_ID_AQUI")

# Supabase → Painel do Supabase → Settings → API → SERVICE ROLE KEY
SUPABASE_URL = os.getenv("SUPABASE_URL", "SUA_SUPABASE_URL_AQUI")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "SUA_SERVICE_ROLE_KEY_AQUI")

# Filtros
ANO_MINIMO = 2020
APAGAR_LOCAL = True  # True = apaga o arquivo após upload
PASTA_DOWNLOADS = "downloads"

# ============================================================

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log(msg: str, color: str = Colors.OKBLUE):
    print(f"{color}{msg}{Colors.ENDC}")

def log_success(msg: str):
    log(f"✅ {msg}", Colors.OKGREEN)

def log_error(msg: str):
    log(f"❌ {msg}", Colors.FAIL)

def log_warning(msg: str):
    log(f"⚠️  {msg}", Colors.WARNING)

def log_info(msg: str):
    log(f"ℹ️  {msg}", Colors.OKCYAN)

class MovieFlixImporter:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "MovieFlix-Importer/1.0",
            "Accept": "application/json"
        })

        self.filmes_encontrados: List[Dict[str, Any]] = []
        self.filmes_processados: List[Dict[str, Any]] = []
        self.erros: List[str] = []

        Path(PASTA_DOWNLOADS).mkdir(exist_ok=True)
        self._validar_config()

    def _validar_config(self):
        configs = {
            "TMDB_API_KEY": TMDB_API_KEY,
            "BUNNY_API_KEY": BUNNY_API_KEY,
            "BUNNY_LIBRARY_ID": BUNNY_LIBRARY_ID,
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_SERVICE_KEY": SUPABASE_SERVICE_KEY,
        }
        faltando = [k for k, v in configs.items() if not v or "AQUI" in str(v)]
        if faltando:
            log_error(f"Configurações faltando: {', '.join(faltando)}")
            log_info("Configure via variáveis de ambiente ou edite o script.")
            sys.exit(1)

    def _instalar_ytdlp(self):
        try:
            subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        except (FileNotFoundError, subprocess.CalledProcessError):
            log_info("Instalando yt-dlp...")
            subprocess.run([sys.executable, "-m", "pip", "install", "yt-dlp", "-q"], check=True)
            log_success("yt-dlp instalado!")

    def listar_videos_youtube(self) -> List[Dict[str, Any]]:
        log("📋 Listando vídeos do canal do YouTube...", Colors.HEADER)
        self._instalar_ytdlp()

        cmd = [
            "yt-dlp",
            "--flat-playlist",
            "--print", "%(title)s|%(id)s|%(duration)s|%(upload_date)s",
            f"https://youtube.com/{YOUTUBE_CHANNEL}/videos"
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            log_error(f"Erro ao listar vídeos: {result.stderr}")
            return []

        videos = []
        for line in result.stdout.strip().split('\n'):
            if '|' not in line:
                continue
            parts = line.split('|')
            if len(parts) >= 3:
                title, video_id, duration = parts[0], parts[1], parts[2]
                upload_date = parts[3] if len(parts) > 3 else ""
                titulo_limpo = self._extrair_titulo(title)

                videos.append({
                    'titulo_yt': title.strip(),
                    'titulo_busca': titulo_limpo,
                    'video_id': video_id,
                    'url': f"https://youtube.com/watch?v={video_id}",
                    'duracao_segundos': int(duration) if duration.isdigit() else 0,
                    'upload_date': upload_date,
                })

        log_success(f"{len(videos)} vídeos encontrados no canal")
        return videos

    def _extrair_titulo(self, titulo_yt: str) -> str:
        padroes_remover = [
            r'FILME COMPLETO DUBLADO',
            r'FILME COMPLETO',
            r'FILME',
            r'DUBLADO',
            r'\|.*?$',
            r'Noite de Filmes',
            r'#\w+',
        ]
        titulo = titulo_yt
        for padrao in padroes_remover:
            titulo = re.sub(padrao, '', titulo, flags=re.IGNORECASE)
        return titulo.strip(' |:-')

    def buscar_tmdb(self, titulo: str) -> Optional[Dict[str, Any]]:
        url = "https://api.themoviedb.org/3/search/movie"
        params = {
            "api_key": TMDB_API_KEY,
            "query": titulo,
            "language": "pt-BR",
            "include_adult": False,
            "page": 1
        }

        try:
            resp = self.session.get(url, params=params, timeout=15)
            data = resp.json()

            if data.get("results") and len(data["results"]) > 0:
                filme = data["results"][0]

                # Compara títulos para pegar o mais similar
                if len(data["results"]) > 1:
                    titulo_tmdb = filme.get("title", "").lower()
                    titulo_busca = titulo.lower()
                    similarity1 = self._similaridade(titulo_tmdb, titulo_busca)
                    similarity2 = self._similaridade(data["results"][1].get("title", "").lower(), titulo_busca)
                    if similarity2 > similarity1:
                        filme = data["results"][1]

                return {
                    "tmdb_id": filme["id"],
                    "title": filme.get("title", ""),
                    "original_title": filme.get("original_title", ""),
                    "overview": filme.get("overview", ""),
                    "poster_path": filme.get("poster_path", ""),
                    "backdrop_path": filme.get("backdrop_path", ""),
                    "vote_average": filme.get("vote_average", 0),
                    "vote_count": filme.get("vote_count", 0),
                    "release_date": filme.get("release_date", ""),
                    "genre_ids": filme.get("genre_ids", []),
                    "popularity": filme.get("popularity", 0),
                }
        except Exception as e:
            log_error(f"Erro TMDB para '{titulo}': {e}")

        return None

    def _similaridade(self, s1: str, s2: str) -> float:
        set1 = set(s1.split())
        set2 = set(s2.split())
        if not set1 or not set2:
            return 0.0
        intersecao = set1 & set2
        return len(intersecao) / max(len(set1), len(set2))

    def buscar_detalhes_tmdb(self, tmdb_id: int) -> Optional[Dict[str, Any]]:
        url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
        params = {
            "api_key": TMDB_API_KEY,
            "language": "pt-BR",
            "append_to_response": "credits,videos,keywords"
        }

        try:
            resp = self.session.get(url, params=params, timeout=15)
            return resp.json()
        except Exception as e:
            log_error(f"Erro ao buscar detalhes do filme {tmdb_id}: {e}")
            return None

    def filtrar_por_ano(self, videos: List[Dict], ano_minimo: int = ANO_MINIMO) -> List[Dict]:
        log(f"🔍 Buscando {len(videos)} títulos no TMDB e filtrando >{ano_minimo}...", Colors.HEADER)

        filmes_validos = []

        for i, video in enumerate(videos, 1):
            titulo = video['titulo_busca']
            log_info(f"[{i}/{len(videos)}] Buscando: {titulo}")

            filme = self.buscar_tmdb(titulo)

            if not filme:
                log_warning(f"  Não encontrado no TMDB: {titulo}")
                continue

            release_date = filme.get("release_date", "")
            ano = int(release_date[:4]) if release_date and len(release_date) >= 4 else 0

            if ano < ano_minimo:
                log_warning(f"  Ignorado (ano {ano}): {filme['title']}")
                continue

            video.update({
                "tmdb_id": filme["tmdb_id"],
                "title": filme["title"],
                "original_title": filme["original_title"],
                "overview": filme["overview"],
                "poster_path": filme["poster_path"],
                "backdrop_path": filme["backdrop_path"],
                "vote_average": filme["vote_average"],
                "vote_count": filme["vote_count"],
                "release_date": release_date,
                "genre_ids": filme["genre_ids"],
                "ano": ano,
            })

            filmes_validos.append(video)
            log_success(f"  ✅ {filme['title']} ({ano})")
            time.sleep(0.3)

        log_success(f"{len(filmes_validos)} filmes acima de {ano_minimo} encontrados!")
        return filmes_validos

    def baixar_video(self, url: str, titulo: str) -> Optional[str]:
        log(f"⬇️  Baixando: {titulo}", Colors.OKCYAN)

        safe_title = "".join(c for c in titulo if c.isalnum() or c in (' ', '-', '_')).rstrip()
        safe_title = safe_title[:100]
        output_file = os.path.join(PASTA_DOWNLOADS, f"{safe_title}.mp4")

        if os.path.exists(output_file) and os.path.getsize(output_file) > 10_000_000:
            log_success(f"  Arquivo já existe: {output_file}")
            return output_file

        cmd = [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "--no-playlist",
            "--no-warnings",
            "-o", output_file,
            url
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0 and os.path.exists(output_file):
                tamanho = os.path.getsize(output_file) / (1024*1024)
                log_success(f"  Download completo: {tamanho:.1f} MB")
                return output_file
            else:
                log_error(f"  Falha no download: {result.stderr[:200]}")
                return None
        except Exception as e:
            log_error(f"  Erro: {e}")
            return None

    def upload_bunny(self, arquivo: str, titulo: str) -> Optional[str]:
        log(f"☁️  Enviando para Bunny Stream: {titulo}", Colors.OKCYAN)

        headers = {
            "AccessKey": BUNNY_API_KEY,
            "Content-Type": "application/json"
        }

        url_create = f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos"
        data = {"title": titulo}

        try:
            resp = self.session.post(url_create, headers=headers, json=data, timeout=30)
            if resp.status_code not in [200, 201]:
                log_error(f"  Erro ao criar vídeo: {resp.text}")
                return None

            video_data = resp.json()
            video_id = video_data.get("guid")

            if not video_id:
                log_error("  Video ID não retornado")
                return None

            upload_url = f"https://video.bunnycdn.com/library/{BUNNY_LIBRARY_ID}/videos/{video_id}"

            with open(arquivo, "rb") as f:
                upload_resp = self.session.put(upload_url, headers=headers, data=f, timeout=300)

            if upload_resp.status_code == 200:
                log_success(f"  Upload concluído! Video ID: {video_id}")
                return video_id
            else:
                log_error(f"  Erro no upload: {upload_resp.text}")
                return None

        except Exception as e:
            log_error(f"  Erro Bunny: {e}")
            return None

    def inserir_supabase(self, filme: Dict[str, Any], bunny_id: str, detalhes: Optional[Dict]) -> bool:
        log(f"💾 Inserindo no Supabase: {filme['title']}", Colors.OKCYAN)

        # Runtime em minutos
        runtime = detalhes.get("runtime", 0) if detalhes else 0
        if not runtime and filme.get("duracao_segundos"):
            runtime = filme["duracao_segundos"] // 60

        # Gêneros como texto
        generos_texto = []
        genre_map = {
            28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia",
            80: "Crime", 99: "Documentário", 18: "Drama", 10751: "Família",
            14: "Fantasia", 36: "História", 27: "Terror", 10402: "Música",
            9648: "Mistério", 10749: "Romance", 878: "Ficção científica",
            10770: "Cinema TV", 53: "Thriller", 10752: "Guerra", 37: "Faroeste"
        }

        if detalhes and "genres" in detalhes:
            generos_texto = [g["name"] for g in detalhes["genres"]]
        elif filme.get("genre_ids"):
            generos_texto = [genre_map.get(gid, "Desconhecido") for gid in filme["genre_ids"]]

        generos_str = ", ".join(generos_texto) if generos_texto else "Filme"

        # URL do player Bunny (sem referência ao YouTube)
        video_url = f"https://iframe.mediadelivery.net/embed/{BUNNY_LIBRARY_ID}/{bunny_id}"

        # Monta payload conforme estrutura da tabela movies
        payload = {
            "tmdb_id": filme["tmdb_id"],
            "title": filme["title"],
            "description": filme.get("overview", ""),
            "poster_url": f"https://image.tmdb.org/t/p/w500{filme.get('poster_path', '')}" if filme.get('poster_path') else None,
            "backdrop_url": f"https://image.tmdb.org/t/p/original{filme.get('backdrop_path', '')}" if filme.get('backdrop_path') else None,
            "video_url": video_url,
            "language": "pt-BR",
            "quality": "HD",
            "type": "filme",
            "required_plan": "standard",  # ou "basic", "premium" conforme seu plano
            "category": generos_str,
            "duration": f"{runtime} min" if runtime else None,
            "year": str(filme["ano"]),
        }

        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

        try:
            resp = self.session.post(
                f"{SUPABASE_URL}/rest/v1/movies",
                headers=headers,
                json=payload,
                timeout=30
            )

            if resp.status_code in [200, 201]:
                log_success(f"  Inserido no Supabase! ID: {resp.json()[0]['id']}")
                return True
            else:
                log_error(f"  Erro Supabase: {resp.status_code} - {resp.text[:300]}")
                return False
        except Exception as e:
            log_error(f"  Erro ao inserir: {e}")
            return False

    def apagar_local(self, arquivo: str):
        if APAGAR_LOCAL and os.path.exists(arquivo):
            try:
                os.remove(arquivo)
                log_info(f"  🗑️  Arquivo local removido")
            except Exception as e:
                log_warning(f"  Não foi possível apagar: {e}")

    def gerar_relatorio(self):
        relatorio = {
            "data": datetime.now().isoformat(),
            "total_processado": len(self.filmes_processados),
            "total_erros": len(self.erros),
            "filmes": self.filmes_processados,
            "erros": self.erros,
        }

        filename = f"relatorio_importacao_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(relatorio, f, ensure_ascii=False, indent=2)

        log_success(f"📄 Relatório salvo: {filename}")
        return filename

    def run(self):
        log("=" * 70, Colors.HEADER)
        log("🎬 MOVIEFLIX - IMPORTADOR AUTOMÁTICO", Colors.HEADER)
        log("   YouTube → Bunny Stream → Supabase (tabela: movies)", Colors.HEADER)
        log("=" * 70, Colors.HEADER)

        videos = self.listar_videos_youtube()
        if not videos:
            log_error("Nenhum vídeo encontrado. Encerrando.")
            return

        filmes = self.filtrar_por_ano(videos)
        if not filmes:
            log_warning("Nenhum filme acima de 2020 encontrado. Encerrando.")
            return

        for i, filme in enumerate(filmes, 1):
            log("", Colors.ENDC)
            log("─" * 70, Colors.HEADER)
            log(f"🎬 [{i}/{len(filmes)}] {filme['title']} ({filme['ano']})", Colors.BOLD)
            log("─" * 70, Colors.HEADER)

            arquivo = self.baixar_video(filme["url"], filme["title"])
            if not arquivo:
                self.erros.append(f"Falha no download: {filme['title']}")
                continue

            bunny_id = self.upload_bunny(arquivo, filme["title"])
            if not bunny_id:
                self.erros.append(f"Falha no upload Bunny: {filme['title']}")
                continue

            detalhes = self.buscar_detalhes_tmdb(filme["tmdb_id"])
            sucesso = self.inserir_supabase(filme, bunny_id, detalhes)

            if sucesso:
                self.filmes_processados.append({
                    "title": filme["title"],
                    "ano": filme["ano"],
                    "tmdb_id": filme["tmdb_id"],
                    "bunny_id": bunny_id,
                })
            else:
                self.erros.append(f"Falha no Supabase: {filme['title']}")

            self.apagar_local(arquivo)
            time.sleep(2)

        log("", Colors.ENDC)
        log("=" * 70, Colors.HEADER)
        log("📊 RESUMO FINAL", Colors.HEADER)
        log("=" * 70, Colors.HEADER)
        log_success(f"✅ Filmes importados: {len(self.filmes_processados)}")
        if self.erros:
            log_error(f"❌ Erros: {len(self.erros)}")
            for erro in self.erros:
                log_error(f"   - {erro}")

        self.gerar_relatorio()
        log("\n🚀 Processo concluído!", Colors.OKGREEN)

if __name__ == "__main__":
    importer = MovieFlixImporter()
    importer.run()
