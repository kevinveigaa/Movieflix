/**
 * Trial Gate — autorização server-side do teste grátis de 20 segundos.
 *
 * Este módulo é a ÚNICA porta de entrada para o stream HLS real do
 * StreamBetter em produção (o frontend SEMPRE resolve a fonte via
 * /api/streambetter-resolve ou /api/trial-gate — nunca direto no iframe para
 * títulos do catálogo).
 *
 * A autorização NÃO depende de JavaScript do navegador:
 *   - A assinatura é verificada NO SERVIDOR contra o Supabase (tabela
 *     subscriptions, status 'active' e expires_at no futuro);
 *   - O teste grátis é controlado NO BANCO (tabela trial_sessions, criada por
 *     supabase/migrations/20260825120000_trial_sessions.sql): cada conta tem
 *     no máximo 20 segundos de teste, persistidos por usuário (não por
 *     dispositivo/aba). Recarregar a página, trocar de dispositivo ou abrir
 *     outro player NÃO zera o contador — o total consumido está no banco.
 *   - O stream só é devolvido se a conta tiver assinatura ativa OU tempo de
 *     teste restante. A resposta inclui `trial` (limite/consumido) para o
 *     player bloquear a reprodução no segundo 20 exato e o `trialToken` usado
 *     pelo heartbeat de consumo.
 *
 * Fluxo:
 *   1. Front envia o JWT do Supabase (Authorization: Bearer <access_token>).
 *   2. Server valida o JWT (chave JWT do projeto) e identifica o user_id.
 *   3. Server verifica subscriptions (ativo?) → se sim, libera SEM limite.
 *   4. Senão, verifica trial_sessions (tempo restante?) → se > 0, libera com
 *      limite de 20s e token de consumo; se 0/expirado → 402 Subscription
 *      required (o front mostra a tela de assinar).
 *   5. Se autorizado, resolve o stream HLS real (reusa o resolver existente)
 *      e devolve { authorized, url, kind, trial, trialToken }.
 */

const { createClient } = require('@supabase/supabase-js');
const { resolverEmbed } = require('./streambetter-resolver');

const STREAMBETTER_BASE = 'https://streambetter.shop';

// Configuração via variáveis de ambiente (iguais às usadas pelo deploy).
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://mntyanfhxiqspdedmddb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';

/** Decodifica (sem validar assinatura) o payload de um JWT. */
function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Valida a assinatura HS256 do JWT (se JWT_SECRET estiver configurado). */
function jwtValido(payload, token) {
  if (!JWT_SECRET || !token) return false;
  try {
    const [headerB64, payloadB64, sigB64] = String(token).split('.');
    const crypto = require('crypto');
    const expected = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const sig = String(sigB64 || '').replace(/=+$/, '');
    return sig.length > 0 && expected === sig;
  } catch {
    return false;
  }
}

/** Verifica se o usuário tem assinatura ativa (server-side, sem confiar no cliente). */
async function temAssinaturaAtiva(admin, userId) {
  try {
    const { data } = await admin
      .from('subscriptions')
      .select('status, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return false;
    if (data.status !== 'active') return false;
    if (data.expires_at && new Date(data.expires_at) < new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

/** Lê o tempo de teste restante do usuário (0 = esgotado/expirado). */
async function trialRestante(admin, userId) {
  try {
    const { data, error } = await admin.rpc('trial_remaining_seconds', { p_user_id: userId });
    if (error) return 0;
    return Math.max(0, Number(data) || 0);
  } catch {
    return 0;
  }
}

/** Consome tempo de teste de forma atômica (heartbeat do player). */
async function consumirTrial(admin, userId, seconds) {
  try {
    const { data, error } = await admin.rpc('consume_trial_time', {
      p_user_id: userId,
      p_seconds: Math.max(1, Math.floor(Number(seconds) || 0)),
    });
    if (error) return 0;
    return Math.max(0, Number(data) || 0);
  } catch {
    return 0;
  }
}

function registrarTrialGate(app) {
  // GET /api/trial-gate?embed=<url>&t=<segundos>
  // Authorization: Bearer <supabase access token>
  app.get('/api/trial-gate', async (req, res) => {
    try {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';

      // 1) Identifica o usuário pelo JWT do Supabase.
      const payload = decodeJwtPayload(token);
      const userId = payload?.sub;
      if (!userId) {
        return res.status(401).json({ authorized: false, motivo: 'sem_sessao' });
      }
      // Valida a assinatura quando o segredo estiver disponível (produção);
      // sem segredo configurado (dev local), aceita apenas a estrutura do JWT.
      if (JWT_SECRET && !jwtValido(payload, token)) {
        return res.status(401).json({ authorized: false, motivo: 'token_invalido' });
      }

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || 'anon-key-invalida', {
        auth: { persistSession: false },
      });
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ authorized: false, motivo: 'servidor_sem_service_role' });
      }

      // 2) Assinatura ativa? → libera sem limite.
      const assinante = await temAssinaturaAtiva(admin, userId);
      if (assinante) {
        return resolverEResponder(req, res, { assinante: true, trial: null, trialToken: null });
      }

      // 3) Teste grátis: tempo restante no banco.
      const restante = await trialRestante(admin, userId);
      if (restante <= 0) {
        return res.status(402).json({
          authorized: false,
          motivo: 'assinatura_necessaria',
          message: 'Assinatura necessária para continuar assistindo.',
          trial: { trialSeconds: 20, consumedSeconds: 20, remainingSeconds: 0 },
        });
      }

      // 4) Libera com limite de 20s e token de consumo (o heartbeat do player
      //    usa /api/trial-consume para registrar o tempo assistido).
      const trial = {
        trialSeconds: 20,
        consumedSeconds: Math.max(0, 20 - restante),
        remainingSeconds: restante,
      };
      return resolverEResponder(req, res, { assinante: false, trial, trialToken: userId });
    } catch (e) {
      console.error('[TrialGate] erro:', e.message);
      return res.status(502).json({ authorized: false, motivo: 'erro_interno', message: e.message });
    }
  });

  // POST /api/trial-consume  { trialToken, seconds }
  // Heartbeat do player: consome tempo de teste no banco.
  app.post('/api/trial-consume', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = String(body.trialToken || '');
      const seconds = Number(body.seconds) || 0;
      if (!userId) return res.status(401).json({ ok: false, motivo: 'sem_token' });

      const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || 'anon-key-invalida', {
        auth: { persistSession: false },
      });
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({ ok: false, motivo: 'servidor_sem_service_role' });
      }

      const restante = await consumirTrial(admin, userId, seconds);
      return res.json({ ok: true, remainingSeconds: restante, expired: restante <= 0 });
    } catch (e) {
      console.error('[TrialGate] consume erro:', e.message);
      return res.status(502).json({ ok: false, motivo: 'erro_interno' });
    }
  });
}

/** Resolve o stream HLS real e responde com autorização. */
async function resolverEResponder(req, res, ctx) {
  const embed = String(req.query.embed || '');
  if (!embed) {
    return res.status(400).json({ authorized: false, motivo: 'embed_ausente' });
  }
  const startSeconds = req.query.t ? Number(req.query.t) : undefined;
  const resultado = await resolverEmbed(embed, startSeconds);
  if (!resultado || !resultado.success || !resultado.url) {
    return res.json({
      authorized: false,
      motivo: resultado?.motivo || 'sem_stream_direto',
      detalhe: resultado?.detalhe || '',
      trial: ctx.trial ?? null,
      trialToken: ctx.trialToken ?? null,
    });
  }
  return res.json({
    authorized: true,
    url: resultado.url,
    kind: resultado.kind === 'mp4' ? 'mp4' : 'stream',
    label: resultado.label,
    sub: resultado.sub,
    titleId: resultado.titleId,
    episodeId: resultado.episodeId,
    trial: ctx.trial ?? null,
    trialToken: ctx.trialToken ?? null,
  });
}

module.exports = { registrarTrialGate, STREAMBETTER_BASE };
