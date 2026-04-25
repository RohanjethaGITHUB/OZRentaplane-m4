with open('app/actions/booking.ts', 'r') as f:
    content = f.read()

# The file contains TWO copies of `export async function submitFlightRecord`.
# One starts around line 103, another around line 241. Let's find them.
parts = content.split('// ─── Submit flight record ─────────────────────────────────────────────────────')
if len(parts) == 3:
    # First part is up to the first duplicate.
    # Third part is the second duplicate.
    content = parts[0] + '// ─── Submit flight record ─────────────────────────────────────────────────────' + parts[2]

with open('app/actions/booking.ts', 'w') as f:
    f.write(content)

with open('app/actions/admin-booking.ts', 'r') as f:
    content = f.read()

parts = content.split('// ─── Approve post-flight review ───────────────────────────────────────────────')
if len(parts) == 3:
    content = parts[0] + '// ─── Approve post-flight review ───────────────────────────────────────────────' + parts[2]

# The double createAdminScheduleBlock issue?
parts2 = content.split('// ─── Create admin schedule block ──────────────────────────────────────────────')
if len(parts2) == 3:
    content = parts2[0] + '// ─── Create admin schedule block ──────────────────────────────────────────────' + parts2[2]

with open('app/actions/admin-booking.ts', 'w') as f:
    f.write(content)

