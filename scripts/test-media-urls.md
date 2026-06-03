# Test Media URLs — Edge Cases

Covers all three resolution paths: direct extension → yt-dlp → iframe fallback.
Send these URLs in Discord to trigger the bot, or POST to `/api/trigger-test`.

---

## Direct URL Resolution (extension-matched fast path — fixed)

Before fix, these hit yt-dlp → Cobalt → link-preview unnecessarily.
Now caught by `getImageExt` / `getAudioExt` / video regex early in `resolveMediaFromLink`.

| #   | URL                                                                                                                                         | Edge Case                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4`                                                     | Direct MP4, ~5 MB (well under limit)      |
| 2   | `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4`                                        | Direct MP4, ~50 MB (near/over soft limit) |
| 3   | `https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg`                                                    | Direct JPEG image                         |
| 4   | `https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png` | Direct PNG with transparency              |
| 5   | `https://upload.wikimedia.org/wikipedia/commons/7/71/Chuck_Berry_guitar_move.gif`                                                           | Direct GIF animation                      |
| 6   | `https://i.imgur.com/ZOEzUxT.jpeg`                                                                                                          | Imgur direct image (CDN URL, no page)     |

---

## yt-dlp Resolution

| #   | URL                                                                                         | Edge Case                                                            |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 7   | `https://www.youtube.com/watch?v=jNQXAC9IVRw`                                               | YouTube — 18s video (first YouTube video ever)                       |
| 8   | `https://youtu.be/dQw4w9WgXcQ`                                                              | YouTube — short URL format (`youtu.be`)                              |
| 9   | `https://www.youtube.com/watch?v=YE7VzlLtp-4&t=30`                                          | YouTube — with `&t=` timestamp param                                 |
| 10  | `https://www.youtube.com/shorts/H7-s_7-WmBE`                                                | YouTube Shorts (`/shorts/` path)                                     |
| 11  | `https://music.youtube.com/watch?v=ZbZSe6N_BXs`                                             | YouTube Music subdomain → `audioOnly` path (CANONICAL_HOSTS rewrite) |
| 12  | `https://vimeo.com/370117268`                                                               | Vimeo — standard video                                               |
| 13  | `https://streamable.com/x5pgtv`                                                             | Streamable                                                           |
| 14  | `https://soundcloud.com/forss/flickermood`                                                  | SoundCloud — audio-only                                              |
| 15  | `https://www.dailymotion.com/video/x7tgd2t`                                                 | Dailymotion                                                          |
| 16  | `https://www.reddit.com/r/oddlysatisfying/comments/1kdbp4x/this_is_so_satisfying_to_watch/` | Reddit — native video post (reddit_video in JSON)                    |
| 17  | `https://www.reddit.com/r/gifs/comments/1fy6oxi/`                                           | Reddit — GIF post (AnimatedImage path)                               |
| 18  | `https://x.com/NASA/status/1851645927467847869`                                             | Twitter/X — public NASA video tweet                                  |

---

## Iframe Fallback

| #   | URL                                                                          | Edge Case                                               |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| 19  | `https://clips.twitch.tv/ToughAdorableKumquatDancingBanana-nvX4QlzJB57EuDKK` | Twitch clip — rendered as `clips.twitch.tv/embed?clip=` |
| 20  | `https://www.tiktok.com/@tiktok/video/6829267836783971589`                   | TikTok — rendered as `tiktok.com/embed/v2/`             |
| 21  | `https://www.instagram.com/reel/C-example/`                                  | Instagram Reel — embedded (may require cookies/auth)    |

---

## Error / Boundary Cases

| #   | URL                                                                  | Expected Behavior                                                                |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 22  | `https://www.youtube.com/watch?v=AAAAAAAAAA`                         | yt-dlp: video not found → error                                                  |
| 23  | `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLxxxfake&index=2` | YouTube URL with playlist params (should still resolve single video)             |
| 24  | `https://example.com/notafile`                                       | No extension, no yt-dlp match → link-preview fallback                            |
| 25  | `https://httpbin.org/image/jpeg`                                     | Direct image URL without `.jpg` extension (tests extension-less image detection) |

---

## Notes

- **Size limits**: `SIZE_LIMITS.image = 10 MB`, `SIZE_LIMITS.video = 50 MB` (hard); `mediaMaxSizeMB` in settings is soft limit for Discord attachments
- **Reddit video**: parser fetches `https://www.reddit.com/r/.../comments/.../.json` and inspects `post.media.reddit_video.fallback_url`
- **YouTube Music**: `CANONICAL_HOSTS` in `mediaParser.ts:584` rewrites subdomain and forces `audioOnly = true`
- **TikTok/Instagram/Twitch**: resolved in `resolveMediaFromLink()` before yt-dlp via regex match → iframe URL
- **Twitter/X**: yt-dlp path; note special `referer` header workaround in `fetchWithYtDlp()` for `video.twimg.com`
