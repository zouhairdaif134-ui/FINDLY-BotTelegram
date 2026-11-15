# FINDLY Telegram media storage captions

Captions are attached to the video message posted in the configured private storage channel. The caption must be on the same Telegram message as the media file.

## Preferred title-and-year format

Movies:

```text
FINDLY:Movie Title (2026)|1080p
```

Series episodes:

```text
FINDLY:Series Title (2022)|S01E01|1080p
```

- The title must match the title stored in FINDLY Admin.
- The year is the catalog release year, not the episode air year.
- Series captions require both season and episode coordinates in `SxxExx` format.
- The quality label is the final field (for example `480p`, `720p`, `1080p`, or `2160p`).
- The title, year, and media type must resolve to exactly one catalog entry. Missing or ambiguous matches are not linked.
- For a series, the referenced season and episode must already exist in the imported FINDLY catalog.

## Backward compatibility

UUID captions remain supported:

```text
FINDLY:<MOVIE_UUID>|1080p
FINDLY:<SERIES_UUID>|S01E01|1080p
```

Use UUID captions if a title/year combination cannot uniquely identify a catalog item.

## Operational rules

- Add the movie or series to FINDLY Admin before uploading its media.
- Upload only to the configured storage channel.
- Keep the caption on the same message as the media.
- Do not reuse one caption for different files.
- Only upload content for which distribution is authorized.
