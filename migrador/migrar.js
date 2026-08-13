const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createReadStream } = require("fs");
const FormData = require("form-data");
const { google } = require("googleapis");

// ═══════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO — EDITE AQUI
// ═══════════════════════════════════════════════════════════════════
const CONFIG = {
  // Google Drive
  DRIVE_FOLDER_ID: "1dLqgWmstRF6k_VTcVFgEd9jigR3207-E",
  // Bunny Stream
  BUNNY_LIBRARY_ID: "COLE_AQUI",
  BUNNY_API_KEY: "COLE_AQUI",
  // Opções
  TEMP_FOLDER: path.join(process.env.TEMP || "./temp", "movieflix_migracao"),
  MAX_FILE_SIZE_GB: 4.9,     // Bunny free limit
  MIN_DURATION_MIN: 60,      // Só filmes acima de 1h (será verificado pelo tamanho como aproximação)
  DELAY_MS: 3000,            // Delay entre uploads
  SKIP_EXISTING: true,       // Pular se já estiver no Bunny
};

// ═══════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════

let driveClient = null;

async function initDrive() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "service-account-key.json",
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
  driveClient = google.drive({ version: "v3", auth });
}

function log(tipo, msg) {
  const hora = new Date().toLocaleTimeString("pt-BR");
  const icon = { ok: "✅", erro: "❌", info: "ℹ️ ", aviso: "⚠️ ", processo: "⏳" }[tipo] || "🔹";
  console.log(`[${hora}] ${icon} ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════
// 1. LISTAR FILMES DO DRIVE
// ═══════════════════════════════════════════════════════════════════

async function listarFilmes() {
  log("info", "Listando vídeos do Drive...");
  const filmes = [];
  let pageToken = null;

  do {
    const res = await driveClient.files.list({
      q: `'${CONFIG.DRIVE_FOLDER_ID}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, videoMediaMetadata(durationMillis))",
      pageSize: 100,
      pageToken,
    });

    for (const file of res.data.files || []) {
      const sizeBytes = parseInt(file.size || "0");
      const sizeGB = sizeBytes / (1024 ** 3);

      // Duração em minutos (se disponível)
      const durationMs = parseInt(file.videoMediaMetadata?.durationMillis || "0");
      const durationMin = durationMs / 60000;

      // Se não tiver metadado de duração, estima: ~1GB = ~1h em 720p
      const estimativaMin = sizeGB * 60;
      const duracaoReal = durationMin > 0 ? durationMin : estimativaMin;

      filmes.push({
        driveId: file.id,
        nome: file.name,
        sizeBytes,
        sizeGB,
        duracaoMin: duracaoReal,
        mimeType: file.mimeType,
      });
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);

  // Filtrar: só filmes acima de 1 hora e até 5GB
  const validos = filmes.filter(f => f.duracaoMin >= CONFIG.MIN_DURATION_MIN && f.sizeGB <= CONFIG.MAX_FILE_SIZE_GB);
  const grandes = filmes.filter(f => f.sizeGB > CONFIG.MAX_FILE_SIZE_GB);
  const curtos = filmes.filter(f => f.duracaoMin < CONFIG.MIN_DURATION_MIN && f.sizeGB <= CONFIG.MAX_FILE_SIZE_GB);

  log("ok", `Total: ${filmes.length} vídeos | Válidos: ${validos.length} | Curtos: ${curtos.length} | Grandes: ${grandes.length}`);

  if (grandes.length > 0) {
    log("aviso", `${grandes.length} filmes excedem ${CONFIG.MAX_FILE_SIZE_GB}GB (serão pulados):`);
    grandes.forEach(f => console.log(`     - ${f.nome} (${f.sizeGB.toFixed(2)} GB)`));
  }
  if (curtos.length > 0) {
    log("aviso", `${curtos.length} vídeos curtos (menos de 1h) serão pulados`);
  }

  // Ordenar: menores primeiro (teste rápido)
  validos.sort((a, b) => a.sizeBytes - b.sizeBytes);
  return validos;
}

// ═══════════════════════════════════════════════════════════════════
// 2. BAIXAR DO DRIVE (temp)
// ═══════════════════════════════════════════════════════════════════

async function baixar(filme) {
  const safeName = filme.nome.replace(/[<>:"/\|?*]/g, "_");
  const destPath = path.join(CONFIG.TEMP_FOLDER, `${filme.driveId}_${safeName}`);

  if (fs.existsSync(destPath)) {
    const stats = fs.statSync(destPath);
    if (stats.size === filme.sizeBytes) {
      log("ok", `Já baixado: ${filme.nome}`);
      return destPath;
    }
  }

  log("processo", `Baixando: ${filme.nome} (${filme.sizeGB.toFixed(2)} GB, ~${Math.round(filme.duracaoMin)}min)`);

  const dest = fs.createWriteStream(destPath);
  const res = await driveClient.files.get(
    { fileId: filme.driveId, alt: "media" },
    { responseType: "stream" }
  );

  return new Promise((resolve, reject) => {
    let downloaded = 0;
    let lastPct = -1;

    res.data.on("data", (chunk) => {
      downloaded += chunk.length;
      const pct = Math.floor((downloaded / filme.sizeBytes) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        lastPct = pct;
        process.stdout.write(`\r     📥 ${pct}%`);
      }
    });

    res.data.pipe(dest);
    dest.on("finish", () => {
      process.stdout.write("\r     📥 100% ✅\n");
      resolve(destPath);
    });
    dest.on("error", reject);
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. UPLOAD PARA BUNNY STREAM
// ═══════════════════════════════════════════════════════════════════

async function criarVideoBunny(titulo) {
  const url = `https://video.bunnycdn.com/library/${CONFIG.BUNNY_LIBRARY_ID}/videos`;
  const res = await axios.post(url, { title: titulo }, {
    headers: { AccessKey: CONFIG.BUNNY_API_KEY },
  });
  return res.data;
}

async function uploadBunny(videoId, filePath, sizeBytes) {
  const url = `https://video.bunnycdn.com/library/${CONFIG.BUNNY_LIBRARY_ID}/videos/${videoId}`;
  const form = new FormData();
  form.append("file", createReadStream(filePath));

  await axios.put(url, form, {
    headers: { ...form.getHeaders(), AccessKey: CONFIG.BUNNY_API_KEY },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    onUploadProgress: (p) => {
      const pct = ((p.loaded / p.total) * 100).toFixed(0);
      process.stdout.write(`\r     ⬆️  Upload: ${pct}%`);
    },
  });
  process.stdout.write("\r     ⬆️  Upload: 100% ✅\n");
}

function gerarUrls(videoId) {
  return {
    embed: `https://iframe.mediadelivery.net/embed/${CONFIG.BUNNY_LIBRARY_ID}/${videoId}`,
    hls: `https://iframe.mediadelivery.net/play/${CONFIG.BUNNY_LIBRARY_ID}/${videoId}`,
    direct: `https://iframe.mediadelivery.net/embed/${CONFIG.BUNNY_LIBRARY_ID}/${videoId}?autoplay=true`,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 4. LIMPAR TEMP
// ═══════════════════════════════════════════════════════════════════

function limparTemp(filePath) {
  try {
    fs.unlinkSync(filePath);
    log("ok", "Arquivo temporário removido");
  } catch (e) {
    log("aviso", "Não conseguiu remover temp: " + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 5. MIGRAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

async function migrar() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  🚀 MIGRAÇÃO: Google Drive → Bunny Stream                    ║");
  console.log("║  Filmes acima de 1 hora | Até 5GB por arquivo                ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Criar pasta temp
  if (!fs.existsSync(CONFIG.TEMP_FOLDER)) {
    fs.mkdirSync(CONFIG.TEMP_FOLDER, { recursive: true });
  }

  await initDrive();
  const filmes = await listarFilmes();

  if (filmes.length === 0) {
    log("erro", "Nenhum filme válido encontrado!");
    return;
  }

  log("info", `Iniciando migração de ${filmes.length} filmes...`);
  log("info", `Pasta temporária: ${CONFIG.TEMP_FOLDER}`);
  console.log("");

  const resultados = [];

  for (let i = 0; i < filmes.length; i++) {
    const filme = filmes[i];
    console.log(`\n📽️  [${String(i + 1).padStart(3, "0")}/${filmes.length}] ${filme.nome}`);

    try {
      // 1. Baixar
      const filePath = await baixar(filme);

      // 2. Criar no Bunny
      const bunnyVideo = await criarVideoBunny(filme.nome);
      log("ok", `Bunny Video ID: ${bunnyVideo.guid}`);

      // 3. Upload
      await uploadBunny(bunnyVideo.guid, filePath, filme.sizeBytes);

      // 4. Gerar URLs
      const urls = gerarUrls(bunnyVideo.guid);
      log("ok", `Embed: ${urls.embed}`);

      // 5. Salvar resultado
      resultados.push({
        nome: filme.nome,
        videoId: bunnyVideo.guid,
        embedUrl: urls.embed,
        hlsUrl: urls.hls,
        directUrl: urls.direct,
        sizeGB: filme.sizeGB,
        duracaoMin: Math.round(filme.duracaoMin),
      });

      // 6. Limpar temp
      limparTemp(filePath);

      // 7. Delay
      if (i < filmes.length - 1) {
        log("processo", `Aguardando ${CONFIG.DELAY_MS}ms...`);
        await new Promise((r) => setTimeout(r, CONFIG.DELAY_MS));
      }
    } catch (err) {
      log("erro", err.message);
      resultados.push({ nome: filme.nome, erro: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ═══════════════════════════════════════════════════════════════
  const sucessos = resultados.filter((r) => r.videoId);
  const falhas = resultados.filter((r) => r.erro);

  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  📊 RELATÓRIO FINAL                                          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`✅ Sucesso:  ${sucessos.length}`);
  console.log(`❌ Falhas:   ${falhas.length}`);
  console.log("");

  // Salvar relatório TXT
  let txt = "🎬 RELATÓRIO DE MIGRAÇÃO - DRIVE → BUNNY STREAM\n";
  txt += "=" .repeat(75) + "\n\n";
  txt += `Total de filmes: ${filmes.length}\n`;
  txt += `Sucesso: ${sucessos.length} | Falhas: ${falhas.length}\n\n`;
  txt += "-".repeat(75) + "\n\n";

  sucessos.forEach((r, i) => {
    txt += `[${String(i + 1).padStart(3, "0")}] ${r.nome}\n`;
    txt += `    Tamanho: ${r.sizeGB.toFixed(2)} GB | Duração: ~${r.duracaoMin}min\n`;
    txt += `    Video ID: ${r.videoId}\n`;
    txt += `    Embed:    ${r.embedUrl}\n`;
    txt += `    HLS:      ${r.hlsUrl}\n`;
    txt += `    Direct:   ${r.directUrl}\n\n`;
  });

  if (falhas.length > 0) {
    txt += "\n❌ FALHAS:\n";
    txt += "-".repeat(75) + "\n\n";
    falhas.forEach((f) => {
      txt += `    - ${f.nome}: ${f.erro}\n`;
    });
  }

  fs.writeFileSync("relatorio-migracao.txt", txt);
  fs.writeFileSync("relatorio-migracao.json", JSON.stringify(resultados, null, 2));

  log("ok", "Relatório salvo:");
  console.log("     📄 relatorio-migracao.txt  (legível)");
  console.log("     📄 relatorio-migracao.json (dados brutos)");

  // Limpar pasta temp se vazia
  const tempFiles = fs.readdirSync(CONFIG.TEMP_FOLDER);
  if (tempFiles.length === 0) {
    fs.rmdirSync(CONFIG.TEMP_FOLDER);
    log("ok", "Pasta temporária removida");
  }

  console.log("\n🏁 MIGRAÇÃO CONCLUÍDA!");
  console.log("   Pegue os links no relatorio-migracao.txt");
}

// Rodar
migrar().catch((err) => {
  log("erro", `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
