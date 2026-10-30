#!/usr/bin/env bash
# The Billing app tutorial (apps/docs/src/content/docs/tutorials/billing-app.md), as commands.
#
# Run from the top of a new app. CI runs it on every change, so the tutorial can't go
# stale without a build going red. Each `nevela …` line here appears in the tutorial
# exactly as it is here (scripts/tutorials.test.mjs checks).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# The tutorial types `nevela`. A machine without it installed has the app's own launcher
# (PHP=php.bat where php is a .bat, as with Herd in Git Bash).
nevela() { "${PHP:-php}" nevela "$@"; }

# 1. Shillings
printf '\nNEVELA_CURRENCY=UGX\n' >> apps/api/.env

# 2. Clients
nevela resource Client --fields="name:string, company:string, email:email, phone:tel(UG), address:text, photo:image?" --icon=users

# 3. Projects
nevela resource Project --fields="client:belongsTo(Client), name:string, brief:richtext, kind:enum(one_off=One-off|recurring), cycle:enum(monthly|annually) if kind == recurring, amount:money, starts:date, gallery:files(image)?" --icon=briefcase

# 4. Invoices and payments
nevela resource Invoice --fields="number:auto(INV), project:belongsTo(Project), amount:money, due:date, notes:text?" --icon=receipt
nevela resource Payment --fields="invoice:belongsTo(Invoice), amount:money, paidOn:date, method:enum(bank|card|cash|mobile=Mobile money), notes:text?" --icon=wallet

# 5. A business's worth of records
nevela seed Client --count=500
nevela seed Project --count=2000
nevela seed Invoice --count=25000
nevela seed Payment --count=20000

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Client .* 500 records" status.log
grep -q "Resource: Project .* 2,000 records" status.log
grep -q "Resource: Invoice .* 25,000 records" status.log
grep -q "Resource: Payment .* 20,000 records" status.log
grep -q "none pending" status.log
# A phone number, a cycle, a gallery, a number and a method, each as the tutorial says.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")"
(cd apps/api && "${PHP:-php}" "$check") | tee billing.log
grep -q "^phone kept as: +256772123456$" billing.log
grep -q "^a Kenyan number: refused$" billing.log
grep -q "^recurring without a cycle: Needed when the kind is Recurring.$" billing.log
grep -q "^one-off with a cycle: kept empty$" billing.log
grep -q "^seeded one-offs with a cycle: 0$" billing.log
grep -q "^seeded recurring without one: 0$" billing.log
grep -q "^seeded projects with pictures: yes$" billing.log
grep -q "^first invoice: INV-0001$" billing.log
grep -q "^invoices in the list: 25000$" billing.log
grep -q "^amounts in whole shillings: yes$" billing.log
grep -q "^mobile money is called: Mobile money$" billing.log
