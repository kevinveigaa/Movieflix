const KEY = 'mf_downloads';

interface DownloadRecord {
  month: string;
  ids: string[];
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function read(userId: string): DownloadRecord {
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    const parsed = raw ? (JSON.parse(raw) as DownloadRecord) : null;
    if (!parsed || parsed.month !== currentMonth()) {
      return { month: currentMonth(), ids: [] };
    }
    return parsed;
  } catch {
    return { month: currentMonth(), ids: [] };
  }
}

function write(userId: string, record: DownloadRecord) {
  try {
    localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(record));
  } catch {
    /* ignora storage cheio */
  }
}

export function downloadsUsed(userId: string): number {
  return read(userId).ids.length;
}

export function alreadyDownloaded(userId: string, movieId: string): boolean {
  return read(userId).ids.includes(movieId);
}

export function registerDownload(userId: string, movieId: string) {
  const record = read(userId);
  if (!record.ids.includes(movieId)) {
    record.ids.push(movieId);
    write(userId, record);
  }
}

/** Dispara o download do arquivo de vídeo em uma nova aba. */
export function startFileDownload(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
