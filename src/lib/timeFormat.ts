/** Formata segundos para HH:MM:SS ou MM:SS */
export function formatTime(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Formata segundos para "Xh Ymin" ou "Ymin" */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  return `${m}min`;
}

/** Retorna tempo restante: "Faltam 45min" ou "Faltam 1h 20min" */
export function formatTimeRemaining(positionSeconds: number, durationSeconds: number): string {
  if (!durationSeconds || durationSeconds <= 0) return '';
  const remaining = Math.max(0, durationSeconds - positionSeconds);
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  if (h > 0 && m > 0) return `Faltam ${h}h ${m}min`;
  if (h > 0) return `Faltam ${h}h`;
  return `Faltam ${m}min`;
}

/** Data amigável: "Hoje", "Ontem", "Segunda", etc */
export function formatFriendlyDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins < 1 ? 'Agora mesmo' : `Há ${diffMins} min`;
    }
    return `Há ${diffHours}h`;
  }
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) {
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return dias[date.getDay()];
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
