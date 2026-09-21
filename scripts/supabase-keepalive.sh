#!/usr/bin/env bash
# Daily activity ping so the Supabase free-plan project is not paused for inactivity.
#
# Sends one authenticated REST read against public.games with the PUBLIC anon key
# (the same key the browser bundle already carries). No write, no service-role key,
# no new database object: the project's security model stays exactly as documented
# in skills/matchday-supabase-security.
#
# Config: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, taken from the environment
# or from the repo's git-ignored .env (env wins).
#
# Exit codes: 0 ping confirmed (HTTP 200), 2 config missing, 3 ping not confirmed.

set -uo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
env_file="$repo_root/.env"

if [[ -f "$env_file" ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY) ;;
      *) continue ;;
    esac
    value=${value%$'\r'}
    value=${value#[\"\']}
    value=${value%[\"\']}
    [[ -n ${!key:-} ]] || printf -v "$key" '%s' "$value"
  done < <(grep -E '^[[:space:]]*VITE_SUPABASE_(URL|ANON_KEY)=' "$env_file" | sed 's/^[[:space:]]*//')
fi

url=${VITE_SUPABASE_URL:-}
key=${VITE_SUPABASE_ANON_KEY:-}
url=${url%/}

stamp=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

if [[ -z $url || -z $key ]]; then
  echo "$stamp FAIL config: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in $env_file or the environment"
  exit 2
fi

endpoint="$url/rest/v1/games?select=id&limit=1"

response=$(curl --silent --show-error --max-time 30 --retry 3 --retry-delay 5 --retry-all-errors \
  --write-out '\n%{http_code}' \
  --header "apikey: $key" \
  --header "Authorization: Bearer $key" \
  --header 'Accept: application/json' \
  "$endpoint" 2>&1)

status=${response##*$'\n'}
body=${response%$'\n'*}

if [[ $status != 200 ]]; then
  echo "$stamp FAIL http=$status body=${body:0:200}"
  exit 3
fi

if [[ $body != \[* ]]; then
  echo "$stamp FAIL http=200 but body is not a JSON array: ${body:0:200}"
  exit 3
fi

echo "$stamp OK http=200 rows=$(grep -o '"id"' <<<"$body" | wc -l)"
