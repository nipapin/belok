import { query } from '@/lib/db';

// Use the same effective-role partition as the Employees section, including
// manual assignments which override legacy roles.
export async function employeeEmailSet(): Promise<Set<string>> {
  const employees = await query<{ email: string }>(`
    SELECT u.email FROM users u
    LEFT JOIN app_settings a ON a.key = 'employee_roles:' || u.id
    WHERE u.email IS NOT NULL
      AND COALESCE(a.value->'roles', jsonb_build_array(u.role::text)) <> '["USER"]'::jsonb
  `);
  return new Set(employees.map(({ email }) => email.trim().toLowerCase()));
}

export function matchesEmployeeEmail(emails: Set<string>, userEmail?: string | null, guestEmail?: string | null) {
  return [userEmail, guestEmail].some(email => !!email?.trim() && emails.has(email.trim().toLowerCase()));
}
