/** Club avatars are stored as JPEG data URLs in users.photo_url. */

/** ~960px JPEG for TV boards; stay under typical serverless body limits (~4.5MB). */
export const MAX_PHOTO_DATA_URL_CHARS = 1_200_000;

/** Longest edge for compressed club photos (sharp on big TV scoreboards). */
export const CLUB_AVATAR_MAX_SIDE = 960;

export const CLUB_AVATAR_QUALITY = 0.9;
