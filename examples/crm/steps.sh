#!/usr/bin/env bash
# The CRM tutorial (apps/docs/src/content/docs/tutorials/crm.md), as commands.
#
# Run from the top of a new app. CI runs it on every change, so the tutorial can't go
# stale without a build going red. Each `nevela …` line here appears in the tutorial
# exactly as it is here (scripts/tutorials.test.mjs checks).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# A million contacts take a quarter of an hour, which is a tutorial's to spend and not every
# CI run's. The command is the tutorial's, word for word; CRM_CONTACTS=1000000 seeds them all.
contacts="${CRM_CONTACTS:-20000}"
# The tutorial types `nevela`. A machine without it installed has the app's own launcher
# (PHP=php.bat where php is a .bat, as with Herd in Git Bash).
nevela() {
  local args=()
  for arg in "$@"; do args+=("${arg/--count=1000000/--count=${contacts}}"); done
  "${PHP:-php}" nevela "${args[@]}"
}

# 1. Numbers from Uganda, unless they say otherwise
printf '\nNEVELA_PHONE_COUNTRY=UG\n' >> apps/api/.env

# 2. Companies
nevela resource Company --fields="name:string, website:url, domain:domain!, brand:color, country:country(UG), industry:enum(tech=Technology|retail|health|finance), profile:json?" --icon=building-2

# 3. Contacts
nevela resource Contact --fields="firstName:string, lastName:string, email:email!, phone:tel!, company:belongsTo(Company), rating:rating, bestTime:time, winChance:percent, stage:enum(lead|qualified|customer|lost)" --icon=contact

# 4. A million contacts
nevela seed Company --count=1000
nevela seed Contact --count=1000000

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Company .* 1,000 records" status.log
grep -q "Resource: Contact .* $(node -e 'console.log(Number(process.argv[1]).toLocaleString("en-US"))' "$contacts") records" status.log
grep -q "none pending" status.log
grep -q 'domain: field.domain' apps/web/resources/company.resource.ts
grep -q 'phone: field.tel({ unique: true, ...({ startsAt: "UG" } as {}) })' apps/web/resources/contact.resource.ts
# The same command again has nothing to do.
nevela seed Contact --count=1000000 | tee again.log
grep -q "are there, and you asked for" again.log
# What the API does with what a person types.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")" # a Windows PHP reads Windows paths
(cd apps/api && "${PHP:-php}" "$check") | tee crm.log
grep -q "^company 201 example.com #aabbcc UG Technology$" crm.log
grep -q "^the same domain written another way: refused$" crm.log
grep -q "^contact 201 ada.nakato@example.com +256772123456 09:05 62.5$" crm.log
grep -q "^the same email in capitals: refused$" crm.log
grep -q "^the same phone written another way: refused$" crm.log
grep -q "^a number from abroad: +447400123456$" crm.log
grep -q "^a number too short: Enter a valid phone number, such as 0772 123456 or +256 772 123456. One from another country starts with its code.$" crm.log
grep -q "^a rating of six: refused$" crm.log
grep -q "^seeded phones that are real: all$" crm.log
grep -q "^seeded emails each their own: yes$" crm.log
