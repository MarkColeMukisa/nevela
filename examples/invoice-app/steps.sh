#!/usr/bin/env bash
# The Invoice app tutorial (apps/docs/src/content/docs/tutorials/invoice-app.md), as commands.
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

# 2. Customers and products
nevela resource Customer --fields="name:string, email:email, company:string?" --icon=users --seed=12
nevela resource Product --fields="name:string, price:money" --icon=package --seed=10

# 3. Invoices and their lines
nevela resource Invoice --fields="number:auto(INV), customer:belongsTo(Customer), status:enum(draft|sent|paid)=draft, terms:enum(net15=Net 15|net30=Net 30)=net30, reminderSent:boolean=false" --items="InvoiceItem: product:belongsTo(Product), quantity:int, price:money(product.price)" --icon=receipt --seed=20

# 4. A due date, added afterwards
nevela field Invoice dueDate:date

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Customer .* 12 records" status.log
grep -q "Resource: Product .* 10 records" status.log
grep -q "Resource: Invoice .* 20 records" status.log
grep -q "none pending" status.log
grep -q '"items": "InvoiceItem"' apps/api/nevela/resources/invoice.json
ls apps/api/database/migrations | grep -q 'add_due_date_to_invoices_table'
grep -q 'dueDate: field.date()' apps/web/resources/invoice.resource.ts
# Every record's page can be printed.
grep -q '<PrintButton' apps/web/components/dashboard/record-detail.tsx
test -f apps/web/components/dashboard/print-record.css
# An invoice made over the API is numbered and priced by Laravel, and asks for its due date.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")" # a Windows PHP reads Windows paths
(cd apps/api && "${PHP:-php}" "$check") | tee invoice.log
grep -q "^seeded prices are the products': yes$" invoice.log
grep -q "^seeded invoices without a due date: 20$" invoice.log
grep -q "^without a due date: refused$" invoice.log
grep -q "^invoice 201 INV-0021 draft net30$" invoice.log
grep -q "^prices from the products: yes$" invoice.log
grep -q "^no total is stored: yes$" invoice.log
grep -q "^an earlier invoice can still be marked paid: paid$" invoice.log
grep -q "^a status it can't have: refused$" invoice.log
grep -q "^net30 is called: Net 30$" invoice.log
grep -q "^each its own number: yes$" invoice.log
