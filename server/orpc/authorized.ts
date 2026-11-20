import { base } from './context'

// This is the public demo build, which has no accounts and no login, so there is
// nothing to authorize against: `authorized` is the bare base procedure. Every
// procedure in the router still builds on it, so restoring authentication is a
// matter of putting a middleware back on this one line.
export const authorized = base
