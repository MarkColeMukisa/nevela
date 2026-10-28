#!/usr/bin/env bash
# The Contacts tutorial (apps/docs/src/content/docs/tutorials/contacts.md), as commands.
#
# Run from the top of a new app. CI runs it on every change, so the tutorial can't go
# stale without a build going red. Each `nevela …` line here, and each file in files/,
# appears in the tutorial exactly as it is here (scripts/tutorials.test.mjs checks).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# The tutorial types `nevela`. A machine without it installed has the app's own launcher
# (PHP=php.bat where php is a .bat, as with Herd in Git Bash).
nevela() { "${PHP:-php}" nevela "$@"; }
# Merges a JSON file of the tutorial's into a key of a descriptor, as you would by hand.
merge() { node -e '
  const fs = require("fs"), [file, key, from] = process.argv.slice(1);
  const descriptor = JSON.parse(fs.readFileSync(file, "utf8"));
  descriptor[key] = { ...(descriptor[key] ?? {}), ...JSON.parse(fs.readFileSync(from, "utf8")) };
  fs.writeFileSync(file, JSON.stringify(descriptor, null, 4) + "\n");
' "$@"; }

# 2. Companies
nevela resource Company --fields="name:string!, website:url?, industry:enum(software|retail|finance|health|education)?" --icon=building-2 --seed=12

# 3. Contacts
nevela resource Contact --fields="name:string, email:email!, phone:tel?, company:belongsTo(Company)?, status:enum(lead|customer|lost), notes:text?" --icon=contact --seed=200

# 5. One more field
merge apps/api/nevela/resources/contact.json fields "$here/files/field.json"
nevela generate Contact
sleep 1 # its migration has to come after the one that made the table
cp "$here/files/add_last_contacted_on_to_contacts_table.php" "apps/api/database/migrations/$(date -u +%Y_%m_%d_%H%M%S)_add_last_contacted_on_to_contacts_table.php"
nevela migrate

# 6. An action
merge apps/api/nevela/resources/contact.json actions "$here/files/actions.json"
nevela generate Contact
cp "$here/files/MarkCustomer.php" apps/api/app/Nevela/Actions/Contact/MarkCustomer.php

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Company .* 12 records" status.log
grep -q "Resource: Contact .* 200 records" status.log
grep -q "none pending" status.log
grep -q "lastContactedOn: field.date" apps/web/resources/contact.resource.ts
grep -q '"permission": "contacts.mark_customer"' apps/web/resources/index.ts
# The action does what the tutorial says, on a lead.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")" # a Windows PHP reads Windows paths
(cd apps/api && "${PHP:-php}" "$check") | tee action.log
grep -q "is a customer now" action.log
grep -q "^customer $(date -u +%Y-%m-%d)" action.log
