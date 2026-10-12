/** Club avatars are stored as JPEG data URLs in users.photo_url. */

/**
 * ~1280px JPEG for big TV boards. Base64 fits under typical serverless
 * body limits (~4.5MB); keep headroom for the rest of the JSON body.
 */
export const MAX_PHOTO_DATA_URL_CHARS = 1_800_000;

/** Longest edge for compressed club photos (sharp on 1080p/4K TVs). */
export const CLUB_AVATAR_MAX_SIDE = 1280;

export const CLUB_AVATAR_QUALITY = 0.92;
