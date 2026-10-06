/** Club avatars are stored as JPEG data URLs in users.photo_url. */

/** ~512px JPEG for TV boards; stay under typical serverless body limits (~4.5MB). */
export const MAX_PHOTO_DATA_URL_CHARS = 900_000;

/** Longest edge for compressed club photos (readable on TV scoreboard). */
export const CLUB_AVATAR_MAX_SIDE = 512;

export const CLUB_AVATAR_QUALITY = 0.85;
