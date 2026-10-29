#!/usr/bin/env bash
# The Student app tutorial (apps/docs/src/content/docs/tutorials/student-app.md), as commands.
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
# Puts a method of the tutorial's in a model, under the line that says where your own code goes.
yours() { node -e '
  const fs = require("fs"), [file, from] = process.argv.slice(1);
  const marker = "    // Your own relationships, scopes and accessors go here — outside the generated block.";
  const model = fs.readFileSync(file, "utf8");
  if (!model.includes(marker)) throw new Error(`${file} has no line for your own code`);
  fs.writeFileSync(file, model.replace(marker, `${marker}\n\n${fs.readFileSync(from, "utf8").trimEnd()}`));
' "$@"; }
# Does what the tutorial does by hand in the dashboard: a role on the Roles screen, a teacher and their courses.
by_hand() {
  local script="$here/by-hand.php"
  command -v cygpath > /dev/null && script="$(cygpath -w "$script")" # a Windows PHP reads Windows paths
  (cd apps/api && "${PHP:-php}" "$script" "$@")
}

# 2. Teachers
nevela resource Teacher --fields="name:string, email:email!, subject:string?" --icon=user --seed=6

# 3. Courses
nevela resource Course --fields="title:string, code:string!, teacher:belongsTo(Teacher), description:text?" --icon=book-open --seed=12

# 4. Students
nevela resource Student --fields="name:string, email:email!, number:auto(STU), dateOfBirth:date?" --icon=graduation-cap --seed=120

# 5. Enrolments: students and courses, many to many
nevela resource Enrolment --fields="student:belongsTo(Student), course:belongsTo(Course), status:enum(active|completed|dropped)=active" --unique=student,course --icon=clipboard --seed=300

# 6. A teacher who signs in
by_hand role TEACHER courses.view students.view enrolments.view enrolments.edit
nevela user --name="Grace Nakitende" --email=grace@example.com --password=password --role=TEACHER
by_hand teacher "Grace Nakitende" grace@example.com 2

# 7. Only her own classes
yours apps/api/app/Models/Teacher.php "$here/files/teacherOf.php"
yours apps/api/app/Models/Course.php "$here/files/courseVisibleTo.php"
yours apps/api/app/Models/Enrolment.php "$here/files/enrolmentVisibleTo.php"
yours apps/api/app/Models/Student.php "$here/files/studentVisibleTo.php"

# 8. Students who sign themselves up
merge apps/api/nevela/resources/student.json public "$here/files/public.json"
nevela generate Student
nevela migrate
mkdir -p apps/web/app/join
cp "$here/files/page.tsx" apps/web/app/join/page.tsx
cp "$here/files/join-form.tsx" apps/web/app/join/join-form.tsx

# 9. Telling the teacher
yours apps/api/app/Models/Enrolment.php "$here/files/dropped.php"

# Checks: what the tutorial says you have. Nothing below here is a step of the tutorial.
# Read, not trusted for its exit code: it is red for a port 8000 another app is using.
nevela status > status.log || true
grep -q "Resource: Teacher .* 7 records" status.log
grep -q "Resource: Course .* 12 records" status.log
grep -q "Resource: Student .* 120 records" status.log
grep -q "Resource: Enrolment .* 300 records" status.log
grep -q "none pending" status.log
grep -q '"unique": \[' apps/api/nevela/resources/enrolment.json
# Grace sees her own classes and nothing else; a sign-up is confirmed and told of; a drop reaches her.
check="$here/check.php"
command -v cygpath > /dev/null && check="$(cygpath -w "$check")"
(cd apps/api && "${PHP:-php}" "$check") | tee school.log
grep -q "^seeded pairs apart: yes$" school.log
grep -q "^second enrolment refused: yes$" school.log
grep -q "^grace's courses: 2 of 12$" school.log
grep -q "^grace's enrolments are in her courses: yes$" school.log
grep -q "^another course: 404$" school.log
grep -q "^sign-up 201, confirmed after the link: yes$" school.log
grep -q "^admin told of the sign-up: yes$" school.log
grep -q "^grace told of the sign-up: no$" school.log
grep -q "^grace told of the drop: yes$" school.log
