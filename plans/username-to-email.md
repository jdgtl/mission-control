# Plan: Switch Username to Email

## Context
Auth currently uses a plain `username` field (e.g. "jonathan", "aabo"). Switch to email addresses so login is email + password. Update existing accounts:
- jonathan -> jonathan@saucecreative.co (admin)
- aabo -> thomas@saucecreative.co (user)

## Changes

### 1. Backend: `lib/auth.js`
- Rename `username` field to `email` in:
  - `getUserByUsername()` -> `getUserByEmail()` (line 79)
  - `authenticateUser()` param and return (line 85)
  - `createUser()` param, uniqueness check, and stored field (line 125)
  - `generateAccessToken()` JWT payload (line 40): `{ userId, email, role }`
- Update email validation: change `^[a-zA-Z0-9_-]+$` regex to a proper email check

### 2. Backend: `server.js`
- Login endpoint (line ~113): `req.body.username` -> `req.body.email`, update error message
- Register endpoint (line ~142): same rename, update validation regex
- `req.user` object (line ~93): `username` -> `email`
- Admin users endpoint (line ~2861): return `email` instead of `username`
- Admin health endpoint (line ~2922): return `email` instead of `username`
- Logging references (lines ~360, ~3003, ~3006): `username` -> `email`

### 3. Backend: `lib/user-context.js`
- Constructor (line 14): `this.username` -> `this.email`

### 4. Frontend: `frontend/src/lib/auth.tsx`
- `User` interface: `username: string` -> `email: string`
- `login()` / `register()` function signatures: `username` -> `email`
- JSON body in fetch calls: `{ username, ... }` -> `{ email, ... }`

### 5. Frontend: `frontend/src/pages/Login.tsx`
- State: `username` -> `email`
- Input: `type="text"` -> `type="email"`, label "Email", `autoComplete="email"`

### 6. Frontend: `frontend/src/pages/Register.tsx`
- State: `username` -> `email`
- Input: `type="text"` -> `type="email"`, label "Email", `autoComplete="email"`
- displayName placeholder: no longer default to username

### 7. Frontend: `frontend/src/pages/Admin.tsx`
- `User` interface: `username` -> `email`
- `GatewayHealth` interface: `username` -> `email`
- Display: `@{user.username}` -> `{user.email}`

### 8. Frontend: `frontend/src/components/Sidebar.tsx`
- Fallback chain: `user?.displayName || user?.email || displayName`

### 9. Data migration: `data/users.json`
- Rename `username` field to `email` for both users
- jonathan -> jonathan@saucecreative.co
- aabo -> thomas@saucecreative.co

### 10. Build + deploy
- `cd frontend && npm run build`
- Restart mission-control service
- Commit + push

## Verification
- Login with `jonathan@saucecreative.co` / `changeme`
- Check admin panel shows emails
- Check gateway health shows emails
- Test register form shows email field

## Files to modify (~10 files)
- `lib/auth.js`
- `lib/user-context.js`
- `server.js`
- `frontend/src/lib/auth.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Register.tsx`
- `frontend/src/pages/Admin.tsx`
- `frontend/src/components/Sidebar.tsx`
- `data/users.json`
