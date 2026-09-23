#!/bin/sh
# Monta a autorização do proxy de simulação a partir do ambiente (T027, ADR-0003).
#
# Roda na inicialização do contêiner, antes do nginx subir — a imagem oficial executa tudo
# em /docker-entrypoint.d. A chave NUNCA vai para o bundle nem para a imagem: existe só no
# ambiente do contêiner e neste arquivo gerado na hora, legível apenas pelo root.
#
#   SIMULATION_API_TOKEN    a chave da API de simulação (com ou sem o prefixo "Bearer ")
#   SIMULATION_TOKEN_HOSTS  hosts ALÉM de localhost e 127.0.0.1 que recebem a chave,
#                           separados por espaço. Vazio por padrão.
#
# Por que só localhost por padrão: com a chave no servidor, quem alcança o proxy usa a conta
# do dono da chave. Em localhost isso é o próprio dono. Num host público seria todo visitante
# — declarar o host aqui é assumir isso por escrito. Também é a defesa contra DNS rebinding:
# uma página maliciosa que aponte um domínio próprio para 127.0.0.1 chega com outro Host e
# não recebe a chave. É a mesma regra do proxy de desenvolvimento (scripts/simulationProxy.ts).
set -eu

destino=/etc/nginx/conf.d/00-simulation-auth.conf
token="${SIMULATION_API_TOKEN:-}"
token="${token#Bearer }"
hosts="${SIMULATION_TOKEN_HOSTS:-}"

# A chave vai entre aspas na configuração do nginx. Aspas, `$`, `;` ou espaço ali quebrariam
# o arquivo — ou pior, injetariam configuração. O conjunto aceito é exatamente o `b64token` da
# RFC 6750, que define o token Bearer: letras, dígitos e `-._~+/`, com `=` no fim. Um token fora
# disso não é um Bearer válido.
if [ -n "$token" ] && ! printf '%s' "$token" | grep -Eq '^[A-Za-z0-9._~+/-]+=*$'; then
  echo "15-chave-da-simulacao: SIMULATION_API_TOKEN tem caracteres fora de [A-Za-z0-9._~+/-] (com '=' só no fim, como no b64token da RFC 6750); o contêiner não sobe com ela." >&2
  exit 1
fi
for h in $hosts; do
  case "$h" in
    *[!A-Za-z0-9.-]*|"")
      echo "15-chave-da-simulacao: host inválido em SIMULATION_TOKEN_HOSTS: '$h'." >&2
      exit 1 ;;
  esac
done

umask 077
{
  echo '# Gerado na inicialização por 15-chave-da-simulacao.sh. Não edite nem versione.'
  echo 'map $host $host_recebe_chave {'
  echo '    default 0;'
  echo '    localhost 1;'
  echo '    127.0.0.1 1;'
  for h in $hosts; do echo "    $h 1;"; done
  echo '}'
  echo 'map $host_recebe_chave $autorizacao_da_simulacao {'
  echo '    default "";'
  if [ -n "$token" ]; then echo "    1 \"Bearer $token\";"; fi
  echo '}'
} > "$destino"

if [ -n "$token" ]; then
  echo "15-chave-da-simulacao: chave da API configurada para localhost${hosts:+ e $hosts}." >&2
else
  echo "15-chave-da-simulacao: SIMULATION_API_TOKEN vazia; o proxy repassa sem autorização e o serviço responderá 401." >&2
fi
