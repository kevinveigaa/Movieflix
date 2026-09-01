-- ============================================================
-- TESTES da migration de ativação manual via WhatsApp
-- Executar como superuser (postgres). Usa auth.uid() via GUC
-- app.current_user_id para simular o usuário logado.
-- ============================================================
\set ON_ERROR_STOP off

-- ============ TESTE 1: E-MAIL + '1' ativa Plano 1 (simple) ============
select 'TESTE 1: ativar Plano 1 (simple)' as teste;
set app.current_user_id = '00000000-0000-0000-0000-000000000001'; -- admin
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '1') as resultado;

-- ============ TESTE 2: E-MAIL + '2' ativa Plano 2 (standard) ============
select 'TESTE 2: ativar Plano 2 (standard)' as teste;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '2') as resultado;

-- ============ TESTE 3: E-MAIL + '3' ativa Plano 3 (premium) ============
select 'TESTE 3: ativar Plano 3 (premium)' as teste;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '3') as resultado;

-- ============ TESTE 4: código 'standard' ativa Plano 2 ============
select 'TESTE 4: ativar com codigo standard' as teste;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', 'standard') as resultado;

-- ============ TESTE 5: e-mail inexistente -> erro claro ============
select 'TESTE 5: e-mail inexistente' as teste;
select public.activate_subscription_by_email('naoexiste@movieflix.test', '1') as resultado;

-- ============ TESTE 6: plano inválido -> erro claro ============
select 'TESTE 6: plano invalido' as teste;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '999') as resultado;

-- ============ TESTE 7: usuário comum tentando ativar -> acesso negado ============
select 'TESTE 7: usuario comum tentando ativar' as teste;
set app.current_user_id = '00000000-0000-0000-0000-000000000002'; -- cliente (nao admin)
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '1') as resultado;

-- ============ TESTE 8: admin ativando usuário existente -> sucesso ============
select 'TESTE 8: admin ativando cliente' as teste;
set app.current_user_id = '00000000-0000-0000-0000-000000000001'; -- admin
select public.activate_subscription_by_email('cliente@movieflix.test', '2') as resultado;

-- ============ TESTE A: RENOVAÇÃO LEGÍTIMA DO MESMO PLANO ============
-- Usuário tem Plano 1 ativo até 10/09 (10 dias restantes), admin ativa Plano 1
-- novamente (pagamento novo, fora da janela) -> DEVE acrescentar 30 dias ao
-- vencimento atual: expira 10/10. E cria 1 novo payment.
select 'TESTE A: renovacao legitima do MESMO plano' as teste;
-- Garante que teste.ativacao tem Plano 1 (simple) ativo até 10/09/2026
update public.subscriptions
  set status='active', plan_code='simple', plan_id=(select id from public.plans where code='simple'),
      starts_at='2026-08-11', expires_at='2026-09-10 23:59:59+00'
  where user_id='00000000-0000-0000-0000-000000000003';
-- Remove pagamentos recentes do mesmo plano para simular "pagamento novo fora da janela"
delete from public.payments
  where user_id='00000000-0000-0000-0000-000000000003' and plan_code='simple' and provider='manual_whatsapp';
select to_char(expires_at, 'YYYY-MM-DD') as expires_antes
  from public.subscriptions where user_id='00000000-0000-0000-0000-000000000003' order by created_at desc limit 1;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '1') as renovacao_mesmo_plano;
-- Esperado: expiracao = 2026-10-10 (acrescentou 30 dias ao vencimento atual, não 30 dias a partir de hoje)
select to_char(expires_at, 'YYYY-MM-DD') as expires_depois
  from public.subscriptions where user_id='00000000-0000-0000-0000-000000000003' order by created_at desc limit 1;
select count(*) as qtd_payments_apos_renovacao
  from public.payments
  where user_id='00000000-0000-0000-0000-000000000003' and plan_code='simple' and status='approved' and provider='manual_whatsapp';

-- ============ TESTE B: REPETIÇÃO ACIDENTAL (duplo clique) ============
-- Imediatamente após o TESTE A, chamar activate(email,'1') de novo -> DEVE ser
-- no-op (não estender dias, não criar payment). expires_at NÃO muda e o count
-- de payments do plano NÃO aumenta.
select 'TESTE B: repeticao acidental (duplo clique) dentro da janela' as teste;
select to_char(expires_at, 'YYYY-MM-DD') as expires_antes_b
  from public.subscriptions where user_id='00000000-0000-0000-0000-000000000003' order by created_at desc limit 1;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '1') as repeticao_acidental;
-- Esperado: mensagem "Operação já processada recentemente (repetição ignorada)"
select to_char(expires_at, 'YYYY-MM-DD') as expires_depois_b
  from public.subscriptions where user_id='00000000-0000-0000-0000-000000000003' order by created_at desc limit 1;
select count(*) as payments_apos_repeticao
  from public.payments
  where user_id='00000000-0000-0000-0000-000000000003' and plan_code='simple' and status='approved' and provider='manual_whatsapp';
-- Esperado: expires_depois_b == expires_antes_b (NÃO mudou) e payments_apos_repeticao == 1

-- ============ TESTE C: UPGRADE preserva dias ============
-- Plano 2 ativo até 10/09 + upgrade para Plano 3 -> expira 10/10
select 'TESTE C: upgrade preserva dias restantes' as teste;
update public.subscriptions
  set status='active', plan_code='standard', plan_id=(select id from public.plans where code='standard'),
      starts_at='2026-08-11', expires_at='2026-09-10 23:59:59+00'
  where user_id='00000000-0000-0000-0000-000000000002';
-- Remove pagamentos recentes do plano 3 para o cliente (evita janela de dedup)
delete from public.payments
  where user_id='00000000-0000-0000-0000-000000000002' and plan_code='premium' and provider='manual_whatsapp';
select public.activate_subscription_by_email('cliente@movieflix.test', '3') as upgrade;
-- Esperado: expiracao = 2026-10-10 (preservou os dias restantes do Plano 2)

-- ============ TESTE D: assinatura expirada -> novo período a partir de agora ============
select 'TESTE D: assinatura expirada comeca novo periodo' as teste;
update public.subscriptions
  set status='active', plan_code='standard', plan_id=(select id from public.plans where code='standard'),
      starts_at='2026-07-01', expires_at='2026-08-01 00:00:00+00'
  where user_id='00000000-0000-0000-0000-000000000002';
delete from public.payments
  where user_id='00000000-0000-0000-0000-000000000002' and plan_code='standard' and provider='manual_whatsapp';
select public.activate_subscription_by_email('cliente@movieflix.test', '2') as expirada;
-- Esperado: expiracao = hoje + 30 dias (novo período a partir de agora)

-- ============ TESTE 9: renovação ativa preserva dias restantes ============
-- Simula: cliente tem assinatura ativa até 10/09, paga 30 dias -> deve ir para 10/10
select 'TESTE 9: renovacao preserva dias restantes' as teste;
update public.subscriptions
  set expires_at = '2026-09-10 23:59:59+00', status='active', starts_at='2026-08-11'
  where user_id = '00000000-0000-0000-0000-000000000002';
select public.activate_subscription_by_email('cliente@movieflix.test', '2') as resultado;
-- Esperado: expiracao = 2026-10-10 (não 30 dias a partir de hoje)

-- ============ TESTE 10: desativação por e-mail -> bloqueia ============
select 'TESTE 10: desativacao por email' as teste;
select public.deactivate_subscription_by_email('cliente@movieflix.test') as resultado;
select status, expires_at from public.subscriptions where user_id='00000000-0000-0000-0000-000000000002' order by created_at desc limit 1;

-- ============ TESTE 11: ativação repetida -> idempotente (1 payment) ============
select 'TESTE 11: ativacao repetida idempotente' as teste;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '1') as r1;
select public.activate_subscription_by_email('teste.ativacao@movieflix.test', '1') as r2;
select count(*) as qtd_payments_plano1
  from public.payments
  where user_id='00000000-0000-0000-0000-000000000003' and plan_code='simple' and status='approved';

-- ============ TESTE 12: e-mail com espaços/maiúsculas ============
select 'TESTE 12: email com espacos e maiusculas' as teste;
select public.activate_subscription_by_email('  TESTE.ATIVACAO@MOVIEFLIX.TEST  ', '2') as resultado;

-- ============ TESTE 13: cancel_my_subscription preserva acesso até fim do período ============
select 'TESTE 13: cancel_my_subscription preserva acesso' as teste;
set app.current_user_id = '00000000-0000-0000-0000-000000000002'; -- cliente
select public.cancel_my_subscription() as resultado;
select status, cancel_at_period_end, expires_at
  from public.subscriptions where user_id='00000000-0000-0000-0000-000000000002' order by created_at desc limit 1;

-- ============ LIMPEZA: remover apenas dados de teste criados ============
select 'LIMPEZA: removendo dados de teste' as teste;
delete from public.payments where user_id in (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
delete from public.subscriptions where user_id in (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);
select 'LIMPEZA CONCLUIDA' as fim;