// Hand-written to match this app's Typelizer route-helper convention (see
// the other files in this directory). Once `bundle install` has run,
// regenerate this for real with the typelizer generator and it'll be
// replaced with the real, verified output.
export { default as Routes } from './RoutesController'
export { default as adminUsers } from './Admin/UsersController'
export { default as adminGroups } from './Admin/GroupsController'
export { default as dashboard } from './DashboardController'
export { default as home } from './HomeController'
export { default as identityEmailVerifications } from './Identity/EmailVerificationsController'
export { default as identityPasswordResets } from './Identity/PasswordResetsController'
export { default as sessions } from './SessionsController'
export { default as songs } from './SongsController'
export { default as songShares } from './SongSharesController'
export { default as songsPhrasings } from './Songs/PhrasingsController'
export { default as songsTimings } from './Songs/TimingsController'
export { default as groups } from './GroupsController'
export { default as memberships } from './MembershipsController'
export { default as setlists } from './SetlistsController'
export { default as setlistSongs } from './SetlistSongsController'
export { default as liveSession } from './LiveSessionsController'
export { default as settingsEmails } from './Settings/EmailsController'
export { default as settingsPasswords } from './Settings/PasswordsController'
export { default as settingsProfiles } from './Settings/ProfilesController'
export { default as settingsSessions } from './Settings/SessionsController'
export { default as users } from './UsersController'

import _identityPasswordResets from './Identity/PasswordResetsController'
import _identityEmailVerifications from './Identity/EmailVerificationsController'
import _home from './HomeController'
import _sessions from './SessionsController'
import _Routes from './RoutesController'
import _settingsEmails from './Settings/EmailsController'
import _settingsPasswords from './Settings/PasswordsController'
import _settingsProfiles from './Settings/ProfilesController'

export const editIdentityPasswordReset = _identityPasswordResets.edit
export const identityEmailVerification = _identityEmailVerifications.show
export const identityPasswordReset = _identityPasswordResets.update
export const newIdentityPasswordReset = _identityPasswordResets.new
export const root = _home.index
export const session = _sessions.destroy
export const settingsAppearance = _Routes.settingsAppearance
export const setlistStage = _Routes.setlistStage
export const settingsEmail = _settingsEmails.show
export const settingsPassword = _settingsPasswords.show
export const settingsProfile = _settingsProfiles.show
export const signIn = _sessions.new
