"""
Grant or revoke the operator role on a Firebase account.

Replaces mission-control's old /api/auth/set-custom-claims endpoint: role
management is an occasional admin task, so it is a CLI run where the service
account lives (the yard satellite or an admin's machine) instead of an HTTP
endpoint on the public site.

Usage:
    python set_operator_claims.py someone@example.com operator
    python set_operator_claims.py someone@example.com admin
    python set_operator_claims.py someone@example.com none      # revoke

Needs the same FIREBASE_* env vars as the operator console (or
GOOGLE_APPLICATION_CREDENTIALS).
"""

import sys

from operator_console import _init_firebase


def main():
    if len(sys.argv) != 3 or sys.argv[2] not in ('operator', 'admin', 'none'):
        print(__doc__)
        sys.exit(1)

    email, role = sys.argv[1], sys.argv[2]

    from firebase_admin import auth

    app = _init_firebase()
    user = auth.get_user_by_email(email, app=app)

    if role == 'none':
        auth.set_custom_user_claims(user.uid, None, app=app)
        print(f'Cleared custom claims for {email} ({user.uid})')
    else:
        auth.set_custom_user_claims(user.uid, {'role': role}, app=app)
        print(f'Set role={role} for {email} ({user.uid})')

    print('The user must sign in again (or refresh their token) to pick this up.')


if __name__ == '__main__':
    main()
